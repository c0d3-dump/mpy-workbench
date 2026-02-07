import * as vscode from "vscode";
import * as mp from "./mpremote";
import {
  disconnectReplTerminal,
  restartReplInExistingTerminal,
  isReplOpen,
} from "./mpremoteCommands";

export interface InfoNode {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  iconColor?: string;
}

export interface EspInfo {
  temperatureF?: number;
  temperatureC?: number;
  hall?: number;
  ramFree?: number;
  ramAlloc?: number;
  ramTotal?: number;
  ramUsagePercent?: number;
  psramSize?: number;
  flashSize?: number;
  cpuFreq?: number;
  chipId?: string;
  micropythonVersion?: string;
  fsTotal?: number;
  fsFree?: number;
  fsUsed?: number;
  fsUsagePercent?: number;
  uptime?: number;
}

export class InfoTree implements vscode.TreeDataProvider<InfoNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  refreshTree(): void {
    this._onDidChangeTreeData.fire();
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }


  // Queue for serial operations
  private opQueue: Promise<any> = Promise.resolve();
  private skipIdleOnce = false;

  getTreeItem(element: InfoNode): vscode.TreeItem {
    const item = new vscode.TreeItem(
      element.label,
      vscode.TreeItemCollapsibleState.None,
    );
    if (element.description) {
      item.description = element.description;
    }
    if (element.icon) {
      item.iconPath = element.iconColor 
        ? new vscode.ThemeIcon(element.icon, new vscode.ThemeColor(element.iconColor))
        : new vscode.ThemeIcon(element.icon);
    }
    item.tooltip = element.label;
    return item;
  }

  async getChildren(): Promise<InfoNode[]> {
    return this.getInfoNodes();
  }

  // Helper to execute mpremote commands with auto-suspend logic
  private async withAutoSuspend<T>(
    fn: () => Promise<T>,
    opts: { preempt?: boolean } = {},
  ): Promise<T> {
    const enabled = vscode.workspace
      .getConfiguration()
      .get<boolean>("mpyWorkbench.serialAutoSuspend", true);
    // Optionally preempt any in-flight mpremote process so new command takes priority
    if (opts.preempt !== false) {
      this.opQueue = Promise.resolve();
    }
    // If auto-suspend disabled or explicitly skipping for this view action, run without ensureIdle/REPL juggling
    if (!enabled || this.skipIdleOnce) {
      this.skipIdleOnce = false;
      try {
        return await fn();
      } finally {
      }
    }
    this.opQueue = this.opQueue
      .catch(() => {})
      .then(async () => {
        const wasOpen = isReplOpen();
        if (wasOpen) await disconnectReplTerminal();
        try {
          // Small delay to allow device to settle
          const d = vscode.workspace
            .getConfiguration()
            .get<number>("mpyWorkbench.preListDelayMs", 150);
          if (d > 0) await new Promise((r) => setTimeout(r, d));
          return await fn();
        } finally {
          if (wasOpen) await restartReplInExistingTerminal();
        }
      });
    return this.opQueue as Promise<T>;
  }

  private async getEspInfo(): Promise<EspInfo> {
    const connect = vscode.workspace
      .getConfiguration()
      .get<string>("mpyWorkbench.connect", "auto");
    if (!connect || connect === "auto") {
      throw new Error("Select a specific serial port first");
    }
    const pythonCode = String.raw`
import esp, esp32, machine, gc, sys
import time

print('=' * 60)
print('ESP32 System Information')
print('=' * 60)

# Temperature
try:
    temp_f = esp32.raw_temperature()
    temp_c = (temp_f - 32) * 5/9
    print(f'Temperature: {temp_f:.1f}°F / {temp_c:.1f}°C')
except:
    print('Temperature: Not available')

# Hall sensor
try:
    hall = esp32.hall_sensor()
    print(f'Hall Sensor: {hall}')
except:
    pass

# Memory usage
gc.collect()
ram_free = gc.mem_free()
ram_alloc = gc.mem_alloc()
ram_total = ram_free + ram_alloc
print(f'RAM Usage  Free: {ram_free:,} bytes ({ram_free/1024:.2f} KB)')
print(f'RAM Usage  Used: {ram_alloc:,} bytes ({ram_alloc/1024:.2f} KB)')
print(f'RAM Usage  Total: {ram_total:,} bytes ({ram_total/1024:.2f} KB)')
print(f'RAM Usage  Usage: {(ram_alloc/ram_total)*100:.1f}%')

# PSRAM
try:
    psram = esp.spiram_size()
    print(f'\nPSRAM: {psram:,} bytes ({psram/1024/1024:.2f} MB)')
except:
    print('\nPSRAM: Not available')

# Flash
flash_size = esp.flash_size()
print(f'\nFlash Size: {flash_size:,} bytes ({flash_size/1024/1024:.2f} MB)')

# CPU Frequency
freq = machine.freq()
print(f'CPU Frequency: {freq:,} Hz ({freq/1000000:.0f} MHz)')

# Chip info
print(f'\nChip ID: {machine.unique_id().hex()}')
print(f'MicroPython: {sys.version}')

# Filesystem
import os
stat = os.statvfs('/')
fs_total = stat[0] * stat[2]
fs_free = stat[0] * stat[3]
fs_used = fs_total - fs_free
print(f'Filesystem  Total: {fs_total:,} bytes ({fs_total/1024:.2f} KB)')
print(f'Filesystem  Used: {fs_used:,} bytes ({fs_used/1024:.2f} KB)')
print(f'Filesystem  Free: {fs_free:,} bytes ({fs_free/1024:.2f} KB)')
print(f'Filesystem  Usage: {(fs_used/fs_total)*100:.1f}%')

# Uptime
print(f'\nUptime: {time.ticks_ms()/1000:.2f} seconds')

print('=' * 60)`;
    try {
      const { stdout } = await this.withAutoSuspend(() =>
        mp.runMpremote(["connect", connect, "exec", pythonCode]),
      );
      return this.parseEspInfo(stdout);
    } catch (error: any) {
      console.error("Failed to get ESP info:", error);
      throw new Error(`Failed to get ESP info: ${error.message || error}`);
    }
  }

  private parseEspInfo(stdout: string): EspInfo {
    const lines = stdout.trim().split("\n");
    const info: EspInfo = {};

    console.log(lines);

    for (const line of lines) {
      // Temperature
      if (line.startsWith("Temperature:")) {
        const match = line.match(
          /Temperature:\s*([\d.-]+)°F\s*\/\s*([\d.-]+)°C/,
        );
        if (match) {
          info.temperatureF = parseFloat(match[1]);
          info.temperatureC = parseFloat(match[2]);
        }
      }
      // Hall Sensor
      else if (line.startsWith("Hall Sensor:")) {
        const match = line.match(/Hall Sensor:\s*([\d.-]+)/);
        if (match) info.hall = parseFloat(match[1]);
      }
      // RAM Usage lines
      else if (
        line.includes("Free:") &&
        line.includes("bytes") &&
        line.includes("RAM Usage")
      ) {
        const match = line.match(/Free:\s*([\d,]+)\s*bytes\s*\(([\d.]+) KB\)/);
        if (match) info.ramFree = parseInt(match[1].replace(/,/g, ""));
      } else if (
        line.includes("Used:") &&
        line.includes("bytes") &&
        line.includes("RAM Usage")
      ) {
        const match = line.match(/Used:\s*([\d,]+)\s*bytes\s*\(([\d.]+) KB\)/);
        if (match) info.ramAlloc = parseInt(match[1].replace(/,/g, ""));
      } else if (
        line.includes("Total:") &&
        line.includes("bytes") &&
        line.includes("RAM Usage")
      ) {
        const match = line.match(/Total:\s*([\d,]+)\s*bytes\s*\(([\d.]+) KB\)/);
        if (match) info.ramTotal = parseInt(match[1].replace(/,/g, ""));
      } else if (
        line.includes("Usage:") &&
        line.includes("%") &&
        line.includes("RAM Usage")
      ) {
        const match = line.match(/Usage:\s*([\d.]+)%/);
        if (match) info.ramUsagePercent = parseFloat(match[1]);
      }
      // PSRAM
      else if (line.startsWith("PSRAM:")) {
        const match = line.match(/PSRAM:\s*([\d,]+)\s*bytes\s*\(([\d.]+) MB\)/);
        if (match) info.psramSize = parseInt(match[1].replace(/,/g, ""));
      }
      // Flash Size
      else if (line.startsWith("Flash Size:")) {
        const match = line.match(
          /Flash Size:\s*([\d,]+)\s*bytes\s*\(([\d.]+) MB\)/,
        );
        if (match) info.flashSize = parseInt(match[1].replace(/,/g, ""));
      }
      // CPU Frequency
      else if (line.startsWith("CPU Frequency:")) {
        const match = line.match(
          /CPU Frequency:\s*([\d,]+)\s*Hz\s*\(([\d.]+) MHz\)/,
        );
        if (match) info.cpuFreq = parseInt(match[1].replace(/,/g, ""));
      }
      // Chip ID
      else if (line.startsWith("Chip ID:")) {
        info.chipId = line.split(":")[1].trim();
      }
      // MicroPython version
      else if (line.startsWith("MicroPython:")) {
        info.micropythonVersion = line.split(":")[1].trim();
      }
      // Filesystem lines
      else if (
        line.includes("Total:") &&
        line.includes("bytes") &&
        line.includes("Filesystem")
      ) {
        const match = line.match(/Total:\s*([\d,]+)\s*bytes\s*\(([\d.]+) KB\)/);
        if (match) info.fsTotal = parseInt(match[1].replace(/,/g, ""));
      } else if (
        line.includes("Used:") &&
        line.includes("bytes") &&
        line.includes("Filesystem")
      ) {
        const match = line.match(/Used:\s*([\d,]+)\s*bytes\s*\(([\d.]+) KB\)/);
        if (match) info.fsUsed = parseInt(match[1].replace(/,/g, ""));
      } else if (
        line.includes("Free:") &&
        line.includes("bytes") &&
        line.includes("Filesystem")
      ) {
        const match = line.match(/Free:\s*([\d,]+)\s*bytes\s*\(([\d.]+) KB\)/);
        if (match) info.fsFree = parseInt(match[1].replace(/,/g, ""));
      } else if (
        line.includes("Usage:") &&
        line.includes("%") &&
        line.includes("Filesystem")
      ) {
        const match = line.match(/Usage:\s*([\d.]+)%/);
        if (match) info.fsUsagePercent = parseFloat(match[1]);
      }
      // Uptime
      else if (line.startsWith("Uptime:")) {
        const match = line.match(/Uptime:\s*([\d.]+)\s*seconds/);
        if (match) info.uptime = parseFloat(match[1]);
      }
    }
    return info;
  }

  async getInfoNodes(): Promise<InfoNode[]> {
    const connect = vscode.workspace
      .getConfiguration()
      .get<string>("mpyWorkbench.connect", "auto");
    const hasPort = !!connect && connect !== "auto";
    let connected = false;
    let errorMsg: string | undefined;
    const nodes: InfoNode[] = [];

    // Helper to format bytes to KB/MB
    const formatBytes = (bytes: number): string => {
      if (bytes >= 1024 * 1024) {
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
      } else if (bytes >= 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
      } else {
        return `${bytes} bytes`;
      }
    };

    // Connection status node
    if (!hasPort) {
      nodes.push({
        id: "connection",
        label: "Board: No port selected",
        description: "Select a serial port to connect",
        icon: "circle-outline",
        iconColor: "errorForeground",
      });
    } else {
      try {
        const espInfo = await this.getEspInfo();
        connected = true;
        // Connected successfully
        nodes.push({
          id: "connection",
          label: `Board: Connected (${connect})`,
          icon: "pass",
          iconColor: "debugIcon.startForeground",
        });

        // Add all info nodes
        if (espInfo.chipId !== undefined) {
          nodes.push({
            id: "chipId",
            label: `Chip ID: ${espInfo.chipId}`,
            icon: "circuit-board",
            iconColor: "icon.foreground",
          });
        }

        if (espInfo.cpuFreq !== undefined) {
          const mhz = espInfo.cpuFreq / 1000000;
          nodes.push({
            id: "cpuFreq",
            label: `CPU Frequency: ${mhz.toFixed(0)} MHz`,
            icon: "cpu",
            iconColor: "icon.foreground",
          });
        }

        if (espInfo.flashSize !== undefined) {
          nodes.push({
            id: "flashSize",
            label: `Flash Size: ${formatBytes(espInfo.flashSize)}`,
            icon: "database",
            iconColor: "icon.foreground",
          });
        }

        if (espInfo.fsTotal !== undefined) {
          nodes.push({
            id: "fsTotal",
            label: `Storage Total: ${formatBytes(espInfo.fsTotal)}`,
            icon: "database",
            iconColor: "icon.foreground",
          });
        }
        if (espInfo.fsUsed !== undefined && espInfo.fsUsagePercent !== undefined) {
          nodes.push({
            id: "fsUsed",
            label: `Storage Used: ${formatBytes(espInfo.fsUsed)} (${espInfo.fsUsagePercent.toFixed(1)}%)`,
            description: espInfo.fsFree !== undefined ? `Free: ${formatBytes(espInfo.fsFree)}` : undefined,
            icon: "circle-filled",
            iconColor: "icon.foreground",
          });
        } else if (espInfo.fsUsed !== undefined) {
          nodes.push({
            id: "fsUsed",
            label: `Storage Used: ${formatBytes(espInfo.fsUsed)}`,
            icon: "circle-filled",
            iconColor: "icon.foreground",
          });
        }

        if (espInfo.micropythonVersion !== undefined) {
          nodes.push({
            id: "micropythonVersion",
            label: `MicroPython: ${espInfo.micropythonVersion}`,
            icon: "code",
            iconColor: "icon.foreground",
          });
        }

        if (espInfo.ramTotal !== undefined) {
          nodes.push({
            id: "ramTotal",
            label: `RAM Total: ${formatBytes(espInfo.ramTotal)}`,
            icon: "memory",
            iconColor: "icon.foreground",
          });
        }
        if (espInfo.ramAlloc !== undefined && espInfo.ramUsagePercent !== undefined) {
          nodes.push({
            id: "ramUsed",
            label: `RAM Used: ${formatBytes(espInfo.ramAlloc)} (${espInfo.ramUsagePercent.toFixed(1)}%)`,
            description: espInfo.ramFree !== undefined ? `Free: ${formatBytes(espInfo.ramFree)}` : undefined,
            icon: "circle-filled",
            iconColor: "icon.foreground",
          });
        } else if (espInfo.ramAlloc !== undefined) {
          nodes.push({
            id: "ramUsed",
            label: `RAM Used: ${formatBytes(espInfo.ramAlloc)}`,
            icon: "circle-filled",
            iconColor: "icon.foreground",
          });
        }

        if (espInfo.temperatureC !== undefined && espInfo.temperatureF !== undefined) {
          nodes.push({
            id: "temperature",
            label: `Temperature: ${espInfo.temperatureC.toFixed(1)}°C / ${espInfo.temperatureF.toFixed(1)}°F`,
            icon: "flame",
            iconColor: "icon.foreground",
          });
        } else if (espInfo.temperatureC !== undefined) {
          nodes.push({
            id: "temperature",
            label: `Temperature: ${espInfo.temperatureC.toFixed(1)}°C`,
            icon: "flame",
            iconColor: "icon.foreground",
          });
        } else if (espInfo.temperatureF !== undefined) {
          nodes.push({
            id: "temperature",
            label: `Temperature: ${espInfo.temperatureF.toFixed(1)}°F`,
            icon: "flame",
            iconColor: "icon.foreground",
          });
        }

        if (espInfo.hall !== undefined) {
          nodes.push({
            id: "hall",
            label: `Hall Sensor: ${espInfo.hall}`,
            icon: "magnet",
            iconColor: "icon.foreground",
          });
        }

        if (espInfo.psramSize !== undefined) {
          nodes.push({
            id: "psramSize",
            label: `PSRAM Size: ${formatBytes(espInfo.psramSize)}`,
            icon: "memory",
            iconColor: "icon.foreground",
          });
        }

        if (espInfo.uptime !== undefined) {
          const hours = Math.floor(espInfo.uptime / 3600);
          const minutes = Math.floor((espInfo.uptime % 3600) / 60);
          const seconds = (espInfo.uptime % 60).toFixed(1);
          let uptimeStr = `${seconds}s`;
          if (minutes > 0) uptimeStr = `${minutes}m ${uptimeStr}`;
          if (hours > 0) uptimeStr = `${hours}h ${uptimeStr}`;
          nodes.push({
            id: "uptime",
            label: `Uptime: ${uptimeStr}`,
            icon: "clock",
            iconColor: "icon.foreground",
          });
        }

        // If no info nodes (should not happen), add a warning
        if (nodes.length === 1) { // only connection node
          nodes.push({
            id: "warning",
            label: "No system information available",
            icon: "warning",
            iconColor: "icon.foreground",
          });
        }
      } catch (error: any) {
        errorMsg = error.message;
        nodes.push({
          id: "connection",
          label: `Board: Disconnected (${connect})`,
          description: errorMsg,
          icon: "error",
          iconColor: "errorForeground",
        });
        nodes.push({
          id: "error",
          label: "Unable to fetch system information",
          description: errorMsg,
          icon: "warning",
          iconColor: "icon.foreground",
        });
      }
    }

    return nodes;
  }
}
