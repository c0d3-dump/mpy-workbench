import * as vscode from "vscode";

export interface FirmwareActionNode {
  id: string;
  label: string;
  command: string;
  args?: any[];
}

export class FirmwareTree implements vscode.TreeDataProvider<FirmwareActionNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refreshTree(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: FirmwareActionNode): vscode.TreeItem {
    return this.getTreeItemForAction(element);
  }

  getChildren(): Thenable<FirmwareActionNode[]> {
    return Promise.resolve(this.getActionNodes());
  }

  getTreeItemForAction(element: FirmwareActionNode): vscode.TreeItem {
    const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
    item.contextValue = "firmwareAction";
    item.command = {
      command: "mpyWorkbench.runFromView",
      title: element.label,
      arguments: [element.command, ...(element.args ?? [])],
    };
    if (element.id === "flash") {
      item.iconPath = new vscode.ThemeIcon("circuit-board", new vscode.ThemeColor("charts.green"));
    } else if (element.id === "erase") {
      item.iconPath = new vscode.ThemeIcon("trash", new vscode.ThemeColor("charts.red"));
    } else if (element.id === "verify") {
      item.iconPath = new vscode.ThemeIcon("check", new vscode.ThemeColor("charts.blue"));
    } else if (element.id === "cleanup") {
      item.iconPath = new vscode.ThemeIcon("clear-all", new vscode.ThemeColor("charts.yellow"));
    }
    return item;
  }

  async getActionNodes(): Promise<FirmwareActionNode[]> {
    return [
      { id: "flash", label: "Flash MicroPython Firmware", command: "mpyWorkbench.firmwareFlash" },
      { id: "erase", label: "Erase Flash Memory", command: "mpyWorkbench.firmwareErase" },
      { id: "verify", label: "Verify Firmware", command: "mpyWorkbench.firmwareVerify" },
      { id: "cleanup", label: "Cleanup Downloaded Firmware", command: "mpyWorkbench.firmwareCleanup" },
    ];
  }
}