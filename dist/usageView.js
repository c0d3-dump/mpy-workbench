"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsageTree = void 0;
const vscode = require("vscode");
const mp = require("./mpremote");
const mpremoteCommands_1 = require("./mpremoteCommands");
class UsageTree {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        // Queue for serial operations
        this.opQueue = Promise.resolve();
        this.skipIdleOnce = false;
    }
    refreshTree() { this._onDidChangeTreeData.fire(); }
    getTreeItem(element) {
        const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
        if (element.description) {
            item.description = element.description;
        }
        if (element.icon) {
            item.iconPath = new vscode.ThemeIcon(element.icon);
        }
        item.tooltip = element.label;
        return item;
    }
    async getChildren() {
        return this.getUsageNodes();
    }
    // Helper to execute mpremote commands with auto-suspend logic
    async withAutoSuspend(fn, opts = {}) {
        const enabled = vscode.workspace.getConfiguration().get("mpyWorkbench.serialAutoSuspend", true);
        // Optionally preempt any in-flight mpremote process so new command takes priority
        if (opts.preempt !== false) {
            this.opQueue = Promise.resolve();
        }
        // If auto-suspend disabled or explicitly skipping for this view action, run without ensureIdle/REPL juggling
        if (!enabled || this.skipIdleOnce) {
            this.skipIdleOnce = false;
            try {
                return await fn();
            }
            finally { }
        }
        this.opQueue = this.opQueue.catch(() => { }).then(async () => {
            const wasOpen = (0, mpremoteCommands_1.isReplOpen)();
            if (wasOpen)
                await (0, mpremoteCommands_1.disconnectReplTerminal)();
            try {
                // Small delay to allow device to settle
                const d = vscode.workspace.getConfiguration().get("mpyWorkbench.preListDelayMs", 150);
                if (d > 0)
                    await new Promise(r => setTimeout(r, d));
                return await fn();
            }
            finally {
                if (wasOpen)
                    await (0, mpremoteCommands_1.restartReplInExistingTerminal)();
            }
        });
        return this.opQueue;
    }
    async getStorageStats() {
        const connect = vscode.workspace.getConfiguration().get("mpyWorkbench.connect", "auto");
        if (!connect || connect === "auto") {
            throw new Error("Select a specific serial port first");
        }
        const pythonCode = `import os; s = os.statvfs('/'); print(f'Total: {s[0]*s[2]/1024:.1f}'); print(f'Free: {s[0]*s[3]/1024:.1f}'); print(f'Used: {(s[0]*s[2] - s[0]*s[3])/1024:.1f}')`;
        try {
            const { stdout } = await this.withAutoSuspend(() => mp.runMpremote(["connect", connect, "exec", pythonCode]));
            const lines = stdout.trim().split('\n');
            let totalKB = 0, freeKB = 0, usedKB = 0;
            for (const line of lines) {
                if (line.startsWith('Total:'))
                    totalKB = parseFloat(line.split(':')[1].trim());
                else if (line.startsWith('Free:'))
                    freeKB = parseFloat(line.split(':')[1].trim());
                else if (line.startsWith('Used:'))
                    usedKB = parseFloat(line.split(':')[1].trim());
            }
            const usedPercent = totalKB > 0 ? Math.round((usedKB / totalKB) * 100) : 0;
            return { totalKB, freeKB, usedKB, usedPercent };
        }
        catch (error) {
            console.error('Failed to get storage stats:', error);
            throw new Error(`Failed to get storage stats: ${error.message || error}`);
        }
    }
    async getUsageNodes() {
        try {
            const { totalKB, freeKB, usedKB, usedPercent } = await this.getStorageStats();
            return [
                {
                    id: "total",
                    label: `Total Storage: ${totalKB.toFixed(1)} KB`,
                    icon: "database"
                },
                {
                    id: "used",
                    label: `Used: ${usedKB.toFixed(1)} KB (${usedPercent}%)`,
                    description: `Free: ${freeKB.toFixed(1)} KB`,
                    icon: "circle-filled"
                }
            ];
        }
        catch (error) {
            return [
                {
                    id: "error",
                    label: "Unable to fetch storage usage",
                    description: error.message,
                    icon: "error"
                }
            ];
        }
    }
}
exports.UsageTree = UsageTree;
//# sourceMappingURL=usageView.js.map