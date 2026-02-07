"use strict";
async;
getEspInfo();
Promise < EspInfo > {
    const: connect = vscode.workspace.getConfiguration().get("mpyWorkbench.connect", "auto"),
    if(, connect) { }
} || connect === "auto";
{
    throw new Error("Select a specific serial port first");
}
const pythonCode = String.raw `
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
print(f'\nRAM Usage:')
print(f'  Free: {ram_free:,} bytes ({ram_free/1024:.2f} KB)')
print(f'  Used: {ram_alloc:,} bytes ({ram_alloc/1024:.2f} KB)')
print(f'  Total: {ram_total:,} bytes ({ram_total/1024:.2f} KB)')
print(f'  Usage: {(ram_alloc/ram_total)*100:.1f}%')

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
print(f'\nFilesystem:')
print(f'  Total: {fs_total:,} bytes ({fs_total/1024:.2f} KB)')
print(f'  Used: {fs_used:,} bytes ({fs_used/1024:.2f} KB)')
print(f'  Free: {fs_free:,} bytes ({fs_free/1024:.2f} KB)')
print(f'  Usage: {(fs_used/fs_total)*100:.1f}%')

# Uptime
print(f'\nUptime: {time.ticks_ms()/1000:.2f} seconds')

print('=' * 60)`;
try {
    const { stdout } = await this.withAutoSuspend(() => mp.runMpremote(["connect", connect, "exec", pythonCode]));
    return this.parseEspInfo(stdout);
}
catch (error) {
    console.error('Failed to get ESP info:', error);
    throw new Error(`Failed to get ESP info: ${error.message || error}`);
}
parseEspInfo(stdout, string);
EspInfo;
{
    const lines = stdout.trim().split('\n');
    const info = {};
    for (const line of lines) {
        // Temperature
        if (line.startsWith('Temperature:')) {
            const match = line.match(/Temperature:\s*([\d.-]+)°F\s*\/\s*([\d.-]+)°C/);
            if (match) {
                info.temperatureF = parseFloat(match[1]);
                info.temperatureC = parseFloat(match[2]);
            }
        }
        // Hall Sensor
        else if (line.startsWith('Hall Sensor:')) {
            const match = line.match(/Hall Sensor:\s*([\d.-]+)/);
            if (match)
                info.hall = parseFloat(match[1]);
        }
        // RAM Usage lines
        else if (line.includes('Free:') && line.includes('bytes') && line.includes('RAM Usage')) {
            const match = line.match(/Free:\s*([\d,]+)\s*bytes\s*\(([\d.]+) KB\)/);
            if (match)
                info.ramFree = parseInt(match[1].replace(/,/g, ''));
        }
        else if (line.includes('Used:') && line.includes('bytes') && line.includes('RAM Usage')) {
            const match = line.match(/Used:\s*([\d,]+)\s*bytes\s*\(([\d.]+) KB\)/);
            if (match)
                info.ramAlloc = parseInt(match[1].replace(/,/g, ''));
        }
        else if (line.includes('Total:') && line.includes('bytes') && line.includes('RAM Usage')) {
            const match = line.match(/Total:\s*([\d,]+)\s*bytes\s*\(([\d.]+) KB\)/);
            if (match)
                info.ramTotal = parseInt(match[1].replace(/,/g, ''));
        }
        else if (line.includes('Usage:') && line.includes('%') && line.includes('RAM Usage')) {
            const match = line.match(/Usage:\s*([\d.]+)%/);
            if (match)
                info.ramUsagePercent = parseFloat(match[1]);
        }
        // PSRAM
        else if (line.startsWith('PSRAM:')) {
            const match = line.match(/PSRAM:\s*([\d,]+)\s*bytes\s*\(([\d.]+) MB\)/);
            if (match)
                info.psramSize = parseInt(match[1].replace(/,/g, ''));
        }
        // Flash Size
        else if (line.startsWith('Flash Size:')) {
            const match = line.match(/Flash Size:\s*([\d,]+)\s*bytes\s*\(([\d.]+) MB\)/);
            if (match)
                info.flashSize = parseInt(match[1].replace(/,/g, ''));
        }
        // CPU Frequency
        else if (line.startsWith('CPU Frequency:')) {
            const match = line.match(/CPU Frequency:\s*([\d,]+)\s*Hz\s*\(([\d.]+) MHz\)/);
            if (match)
                info.cpuFreq = parseInt(match[1].replace(/,/g, ''));
        }
        // Chip ID
        else if (line.startsWith('Chip ID:')) {
            info.chipId = line.split(':')[1].trim();
        }
        // MicroPython version
        else if (line.startsWith('MicroPython:')) {
            info.micropythonVersion = line.split(':')[1].trim();
        }
        // Filesystem lines
        else if (line.includes('Total:') && line.includes('bytes') && line.includes('Filesystem')) {
            const match = line.match(/Total:\s*([\d,]+)\s*bytes\s*\(([\d.]+) KB\)/);
            if (match)
                info.fsTotal = parseInt(match[1].replace(/,/g, ''));
        }
        else if (line.includes('Used:') && line.includes('bytes') && line.includes('Filesystem')) {
            const match = line.match(/Used:\s*([\d,]+)\s*bytes\s*\(([\d.]+) KB\)/);
            if (match)
                info.fsUsed = parseInt(match[1].replace(/,/g, ''));
        }
        else if (line.includes('Free:') && line.includes('bytes') && line.includes('Filesystem')) {
            const match = line.match(/Free:\s*([\d,]+)\s*bytes\s*\(([\d.]+) KB\)/);
            if (match)
                info.fsFree = parseInt(match[1].replace(/,/g, ''));
        }
        else if (line.includes('Usage:') && line.includes('%') && line.includes('Filesystem')) {
            const match = line.match(/Usage:\s*([\d.]+)%/);
            if (match)
                info.fsUsagePercent = parseFloat(match[1]);
        }
        // Uptime
        else if (line.startsWith('Uptime:')) {
            const match = line.match(/Uptime:\s*([\d.]+)\s*seconds/);
            if (match)
                info.uptime = parseFloat(match[1]);
        }
    }
    return info;
}
//# sourceMappingURL=usageView.tmp.js.map