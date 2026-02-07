import * as vscode from "vscode";
import * as cp from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { listSerialPorts } from "./mpremote";

let esptoolPathCache: string | null = null;

async function getEsptoolPath(): Promise<string> {
  if (esptoolPathCache) {
    return esptoolPathCache;
  }

  const candidates = [
    "esptool",
    "esptool.py",
    `${os.homedir()}/.local/bin/esptool`,
    `${os.homedir()}/.local/bin/esptool.py`
  ];

  for (const candidate of candidates) {
    try {
      await new Promise<void>((resolve, reject) => {
        cp.exec(`${candidate} --help`, (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
      esptoolPathCache = candidate;
      return candidate;
    } catch (err) {
      // continue
    }
  }

  throw new Error("esptool not found. Please install esptool: pip install esptool or pipx install esptool");
}

export async function firmwareFlash() {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Flashing MicroPython Firmware",
      cancellable: false,
    },
    async (progress) => {
      try {
        // Check esptool installation
        progress.report({ message: "Checking esptool..." });
        const esptoolAvailable = await checkEsptool();
        if (!esptoolAvailable) {
          const install = await vscode.window.showWarningMessage(
            "esptool not found. Install via pip or pipx?",
            { modal: true },
            "Install"
          );
          if (install === "Install") {
            await installEsptool();
          } else {
            throw new Error("esptool not installed. Please install via pip install esptool or pipx install esptool");
          }
        }

        // Detect serial port
        progress.report({ message: "Detecting serial ports..." });
        const port = await selectPort();
        if (!port) {
          throw new Error("No serial port selected");
        }

        // Select ESP32 variant
        const variant = await selectVariant();
        if (!variant) {
          throw new Error("No variant selected");
        }

        // Download firmware
        progress.report({ message: "Downloading firmware..." });
        const firmwareFile = await downloadFirmware(variant, progress);

        // Erase flash
        progress.report({ message: "Erasing flash..." });
        await eraseFlash(port, variant);

        // Flash firmware
        progress.report({ message: "Flashing firmware..." });
        await flashFirmware(port, variant, firmwareFile);

        // Verify (optional)
        progress.report({ message: "Verifying flash..." });
        await verifyFlash(port, variant, firmwareFile);

        vscode.window.showInformationMessage(
          "Firmware flashed successfully!"
        );
      } catch (error: any) {
        vscode.window.showErrorMessage(`Flash failed: ${error.message}`);
        throw error;
      }
    }
  );
}

export async function firmwareErase() {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Erasing Flash Memory",
      cancellable: false,
    },
    async (progress) => {
      try {
        progress.report({ message: "Checking esptool..." });
        const esptoolAvailable = await checkEsptool();
        if (!esptoolAvailable) {
          const install = await vscode.window.showWarningMessage(
            "esptool not found. Install via pip or pipx?",
            { modal: true },
            "Install"
          );
          if (install === "Install") {
            await installEsptool();
          } else {
            throw new Error("esptool not installed. Please install via pip install esptool or pipx install esptool");
          }
        }

        progress.report({ message: "Detecting serial ports..." });
        const port = await selectPort();
        if (!port) {
          throw new Error("No serial port selected");
        }

        const variant = await selectVariant();
        if (!variant) {
          throw new Error("No variant selected");
        }

        progress.report({ message: "Erasing flash..." });
        await eraseFlash(port, variant);

        vscode.window.showInformationMessage("Flash erased successfully!");
      } catch (error: any) {
        vscode.window.showErrorMessage(`Erase failed: ${error.message}`);
        throw error;
      }
    }
  );
}

export async function firmwareVerify() {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Verifying Firmware",
      cancellable: false,
    },
    async (progress) => {
      try {
        progress.report({ message: "Checking esptool..." });
        const esptoolAvailable = await checkEsptool();
        if (!esptoolAvailable) {
          const install = await vscode.window.showWarningMessage(
            "esptool not found. Install via pip or pipx?",
            { modal: true },
            "Install"
          );
          if (install === "Install") {
            await installEsptool();
          } else {
            throw new Error("esptool not installed. Please install via pip install esptool or pipx install esptool");
          }
        }

        progress.report({ message: "Detecting serial ports..." });
        const port = await selectPort();
        if (!port) {
          throw new Error("No serial port selected");
        }

        const variant = await selectVariant();
        if (!variant) {
          throw new Error("No variant selected");
        }

        progress.report({ message: "Downloading firmware..." });
        const firmwareFile = await downloadFirmware(variant, progress);

        progress.report({ message: "Verifying flash..." });
        await verifyFlash(port, variant, firmwareFile);

        vscode.window.showInformationMessage("Firmware verification passed!");
      } catch (error: any) {
        vscode.window.showErrorMessage(`Verification failed: ${error.message}`);
        throw error;
      }
    }
  );
}

export async function firmwareCleanup() {
  const tmpDir = os.tmpdir();
  const pattern = path.join(tmpDir, "*-latest.bin");
  // simplistic cleanup: delete any .bin files in tmp directory that match pattern
  try {
    const files = await fs.readdir(tmpDir);
    let deleted = 0;
    for (const file of files) {
      if (file.endsWith("-latest.bin")) {
        await fs.unlink(path.join(tmpDir, file));
        deleted++;
      }
    }
    vscode.window.showInformationMessage(`Cleaned up ${deleted} firmware file(s).`);
  } catch (error: any) {
    vscode.window.showErrorMessage(`Cleanup failed: ${error.message}`);
  }
}

// Helper functions
async function checkEsptool(): Promise<boolean> {
  try {
    await getEsptoolPath();
    return true;
  } catch {
    return false;
  }
}

async function installEsptool(): Promise<void> {
  return new Promise((resolve, reject) => {
    cp.exec("pip install esptool", (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Install failed: ${stderr}. You can also try: pipx install esptool`));
      } else {
        resolve();
      }
    });
  });
}

async function selectPort(): Promise<string | undefined> {
  const devices = await listSerialPorts();
  const items: vscode.QuickPickItem[] = devices.map((d) => ({
    label: d.port,
    description: d.name || "serial port",
  }));
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: "Select Board serial port",
  });
  return picked?.label;
}

async function selectVariant(): Promise<string | undefined> {
  const items: vscode.QuickPickItem[] = [
    { label: "esp32", description: "ESP32 (generic)" },
    { label: "esp32s2", description: "ESP32-S2" },
    { label: "esp32s3", description: "ESP32-S3" },
    { label: "esp32c3", description: "ESP32-C3" },
  ];
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: "Select ESP32 variant",
  });
  return picked?.label;
}

async function downloadFirmware(
  variant: string,
  progress: vscode.Progress<{ message?: string; increment?: number }>
): Promise<string> {
  const firmwareUrl = `https://micropython.org/resources/firmware/${variant}-latest.bin`;
  const tmpDir = os.tmpdir();
  const firmwareFile = path.join(tmpDir, `${variant}-latest.bin`);

  // Check if already downloaded
  try {
    await fs.access(firmwareFile);
    progress.report({ message: "Using cached firmware file" });
    return firmwareFile;
  } catch {}

  // Download using curl or wget
  progress.report({ message: `Downloading ${variant} firmware...` });
  const curlExists = await commandExists("curl");
  const wgetExists = await commandExists("wget");
  if (curlExists) {
    await exec(`curl -L -o "${firmwareFile}" "${firmwareUrl}"`);
  } else if (wgetExists) {
    await exec(`wget -O "${firmwareFile}" "${firmwareUrl}"`);
  } else {
    throw new Error("Neither curl nor wget found. Please install one.");
  }
  return firmwareFile;
}

async function eraseFlash(port: string, variant: string): Promise<void> {
  const esptoolPath = await getEsptoolPath();
  await exec(`${esptoolPath} --port "${port}" erase_flash`);
}

async function flashFirmware(
  port: string,
  variant: string,
  firmwareFile: string
): Promise<void> {
  const esptoolPath = await getEsptoolPath();
  await exec(
    `${esptoolPath} --chip ${variant} --port "${port}" write_flash -z 0x1000 "${firmwareFile}"`
  );
}

async function verifyFlash(
  port: string,
  variant: string,
  firmwareFile: string
): Promise<void> {
  // Simple verification: read back and compare size? For now just run verify command
  const esptoolPath = await getEsptoolPath();
  await exec(
    `${esptoolPath} --chip ${variant} --port "${port}" verify_flash 0x1000 "${firmwareFile}"`
  );
}

function exec(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    cp.exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${error.message}\n${stderr}`));
      } else {
        resolve(stdout);
      }
    });
  });
}

async function commandExists(cmd: string): Promise<boolean> {
  return new Promise((resolve) => {
    cp.exec(`which ${cmd}`, (error) => {
      resolve(error === null);
    });
  });
}