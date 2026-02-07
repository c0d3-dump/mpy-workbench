"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.firmwareFlash = firmwareFlash;
exports.firmwareErase = firmwareErase;
exports.firmwareVerify = firmwareVerify;
exports.firmwareCleanup = firmwareCleanup;
const vscode = require("vscode");
const cp = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const mpremote_1 = require("./mpremote");
let esptoolPathCache = null;
async function getEsptoolPath() {
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
            await new Promise((resolve, reject) => {
                cp.exec(`${candidate} --help`, (error) => {
                    if (error) {
                        reject(error);
                    }
                    else {
                        resolve();
                    }
                });
            });
            esptoolPathCache = candidate;
            return candidate;
        }
        catch (err) {
            // continue
        }
    }
    throw new Error("esptool not found. Please install esptool: pip install esptool or pipx install esptool");
}
async function firmwareFlash() {
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Flashing MicroPython Firmware",
        cancellable: false,
    }, async (progress) => {
        try {
            // Check esptool installation
            progress.report({ message: "Checking esptool..." });
            const esptoolAvailable = await checkEsptool();
            if (!esptoolAvailable) {
                const install = await vscode.window.showWarningMessage("esptool not found. Install via pip or pipx?", { modal: true }, "Install");
                if (install === "Install") {
                    await installEsptool();
                }
                else {
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
            vscode.window.showInformationMessage("Firmware flashed successfully!");
        }
        catch (error) {
            vscode.window.showErrorMessage(`Flash failed: ${error.message}`);
            throw error;
        }
    });
}
async function firmwareErase() {
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Erasing Flash Memory",
        cancellable: false,
    }, async (progress) => {
        try {
            progress.report({ message: "Checking esptool..." });
            const esptoolAvailable = await checkEsptool();
            if (!esptoolAvailable) {
                const install = await vscode.window.showWarningMessage("esptool not found. Install via pip or pipx?", { modal: true }, "Install");
                if (install === "Install") {
                    await installEsptool();
                }
                else {
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
        }
        catch (error) {
            vscode.window.showErrorMessage(`Erase failed: ${error.message}`);
            throw error;
        }
    });
}
async function firmwareVerify() {
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Verifying Firmware",
        cancellable: false,
    }, async (progress) => {
        try {
            progress.report({ message: "Checking esptool..." });
            const esptoolAvailable = await checkEsptool();
            if (!esptoolAvailable) {
                const install = await vscode.window.showWarningMessage("esptool not found. Install via pip or pipx?", { modal: true }, "Install");
                if (install === "Install") {
                    await installEsptool();
                }
                else {
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
        }
        catch (error) {
            vscode.window.showErrorMessage(`Verification failed: ${error.message}`);
            throw error;
        }
    });
}
async function firmwareCleanup() {
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
    }
    catch (error) {
        vscode.window.showErrorMessage(`Cleanup failed: ${error.message}`);
    }
}
// Helper functions
async function checkEsptool() {
    try {
        await getEsptoolPath();
        return true;
    }
    catch {
        return false;
    }
}
async function installEsptool() {
    return new Promise((resolve, reject) => {
        cp.exec("pip install esptool", (error, stdout, stderr) => {
            if (error) {
                reject(new Error(`Install failed: ${stderr}. You can also try: pipx install esptool`));
            }
            else {
                resolve();
            }
        });
    });
}
async function selectPort() {
    const devices = await (0, mpremote_1.listSerialPorts)();
    const items = devices.map((d) => ({
        label: d.port,
        description: d.name || "serial port",
    }));
    const picked = await vscode.window.showQuickPick(items, {
        placeHolder: "Select Board serial port",
    });
    return picked?.label;
}
async function selectVariant() {
    const items = [
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
async function downloadFirmware(variant, progress) {
    const firmwareUrl = `https://micropython.org/resources/firmware/${variant}-latest.bin`;
    const tmpDir = os.tmpdir();
    const firmwareFile = path.join(tmpDir, `${variant}-latest.bin`);
    // Check if already downloaded
    try {
        await fs.access(firmwareFile);
        progress.report({ message: "Using cached firmware file" });
        return firmwareFile;
    }
    catch { }
    // Download using curl or wget
    progress.report({ message: `Downloading ${variant} firmware...` });
    const curlExists = await commandExists("curl");
    const wgetExists = await commandExists("wget");
    if (curlExists) {
        await exec(`curl -L -o "${firmwareFile}" "${firmwareUrl}"`);
    }
    else if (wgetExists) {
        await exec(`wget -O "${firmwareFile}" "${firmwareUrl}"`);
    }
    else {
        throw new Error("Neither curl nor wget found. Please install one.");
    }
    return firmwareFile;
}
async function eraseFlash(port, variant) {
    const esptoolPath = await getEsptoolPath();
    await exec(`${esptoolPath} --port "${port}" erase_flash`);
}
async function flashFirmware(port, variant, firmwareFile) {
    const esptoolPath = await getEsptoolPath();
    await exec(`${esptoolPath} --chip ${variant} --port "${port}" write_flash -z 0x1000 "${firmwareFile}"`);
}
async function verifyFlash(port, variant, firmwareFile) {
    // Simple verification: read back and compare size? For now just run verify command
    const esptoolPath = await getEsptoolPath();
    await exec(`${esptoolPath} --chip ${variant} --port "${port}" verify_flash 0x1000 "${firmwareFile}"`);
}
function exec(command) {
    return new Promise((resolve, reject) => {
        cp.exec(command, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(`${error.message}\n${stderr}`));
            }
            else {
                resolve(stdout);
            }
        });
    });
}
async function commandExists(cmd) {
    return new Promise((resolve) => {
        cp.exec(`which ${cmd}`, (error) => {
            resolve(error === null);
        });
    });
}
//# sourceMappingURL=firmwareOperations.js.map