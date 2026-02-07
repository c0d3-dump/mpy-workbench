"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FirmwareTree = void 0;
const vscode = require("vscode");
class FirmwareTree {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }
    refreshTree() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return this.getTreeItemForAction(element);
    }
    getChildren() {
        return Promise.resolve(this.getActionNodes());
    }
    getTreeItemForAction(element) {
        const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
        item.contextValue = "firmwareAction";
        item.command = {
            command: "mpyWorkbench.runFromView",
            title: element.label,
            arguments: [element.command, ...(element.args ?? [])],
        };
        if (element.id === "flash") {
            item.iconPath = new vscode.ThemeIcon("circuit-board", new vscode.ThemeColor("charts.green"));
        }
        else if (element.id === "erase") {
            item.iconPath = new vscode.ThemeIcon("trash", new vscode.ThemeColor("charts.red"));
        }
        else if (element.id === "verify") {
            item.iconPath = new vscode.ThemeIcon("check", new vscode.ThemeColor("charts.blue"));
        }
        else if (element.id === "cleanup") {
            item.iconPath = new vscode.ThemeIcon("clear-all", new vscode.ThemeColor("charts.yellow"));
        }
        return item;
    }
    async getActionNodes() {
        return [
            { id: "flash", label: "Flash MicroPython Firmware", command: "mpyWorkbench.firmwareFlash" },
            { id: "erase", label: "Erase Flash Memory", command: "mpyWorkbench.firmwareErase" },
            { id: "verify", label: "Verify Firmware", command: "mpyWorkbench.firmwareVerify" },
            { id: "cleanup", label: "Cleanup Downloaded Firmware", command: "mpyWorkbench.firmwareCleanup" },
        ];
    }
}
exports.FirmwareTree = FirmwareTree;
//# sourceMappingURL=firmwareView.js.map