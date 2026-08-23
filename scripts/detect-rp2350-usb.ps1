#Requires -Version 5.1
<#
.SYNOPSIS
  Detect Waveshare RP2350-POE-ETH-8DI-8RO on Windows (COM port / RPI-RP2 UF2 drive).

.DESCRIPTION
  - Lists serial ports (Win32_SerialPort + PnP Ports class)
  - Highlights Raspberry Pi USB IDs (VID_2E8A = Raspberry Pi Foundation)
  - Lists removable volumes and RPI-RP2 / Pico bootloader drives
  - Prints Thonny-friendly connection hints

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/detect-rp2350-usb.ps1
#>

$ErrorActionPreference = "Continue"

function Write-Section([string]$Title) {
    Write-Host ""
    Write-Host "=== $Title ===" -ForegroundColor Cyan
}

function Test-Rp2350UsbId([string]$PnpDeviceId) {
    if (-not $PnpDeviceId) { return $false }
    return ($PnpDeviceId -match "VID_2E8A") -or ($PnpDeviceId -match "RPI-RP2|Pico|RP2350|Waveshare")
}

Write-Section "COM Ports (Win32_SerialPort)"
$serialPorts = @(Get-CimInstance Win32_SerialPort -ErrorAction SilentlyContinue)
if ($serialPorts.Count -eq 0) {
    Write-Host "  (none detected)"
} else {
    foreach ($port in $serialPorts) {
        $isRp = Test-Rp2350UsbId $port.PNPDeviceID
        $tag = if ($isRp) { " [RP2350/Pico candidate]" } else { "" }
        Write-Host ("  {0} — {1}{2}" -f $port.DeviceID, $port.Name, $tag)
        Write-Host ("    Description: {0}" -f $port.Description)
        Write-Host ("    PNPDeviceID: {0}" -f $port.PNPDeviceID)
    }
}

Write-Section "PnP Serial / Raspberry Pi USB"
$pnpSerial = @(Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue |
    Where-Object { $_.Class -eq "Ports" -or (Test-Rp2350UsbId $_.InstanceId) })
if ($pnpSerial.Count -eq 0) {
    Write-Host "  (none detected)"
} else {
    $pnpSerial | ForEach-Object {
        $tag = if (Test-Rp2350UsbId $_.InstanceId) { " [RP2350/Pico candidate]" } else { "" }
        Write-Host ("  {0} | {1}{2}" -f $_.Status, $_.FriendlyName, $tag)
        Write-Host ("    InstanceId: {0}" -f $_.InstanceId)
    }
}

Write-Section "USB Mass Storage / UF2 Bootloader (RPI-RP2)"
$removable = @(Get-Volume -ErrorAction SilentlyContinue |
    Where-Object {
        $_.DriveLetter -and (
            $_.DriveType -eq "Removable" -or
            $_.FileSystemLabel -match "RPI|RP2|Pico|Raspberry"
        )
    })
if ($removable.Count -eq 0) {
    Write-Host "  (no removable RPI-RP2 drive — device may be in MicroPython/CDC mode, not BOOTSEL UF2 mode)"
} else {
    foreach ($vol in $removable) {
        $letter = "{0}:" -f $vol.DriveLetter
        Write-Host ("  Drive {0} — Label: {1} — FS: {2} — Size: {3} bytes" -f `
            $letter, $vol.FileSystemLabel, $vol.FileSystem, $vol.Size)
        $indexPath = Join-Path $letter "INDEX.HTM"
        $infoPath = Join-Path $letter "INFO_UF2.TXT"
        if (Test-Path $infoPath) {
            Write-Host "    INFO_UF2.TXT found (UF2 bootloader mode)"
            Get-Content $infoPath -TotalCount 5 | ForEach-Object { Write-Host "      $_" }
        } elseif (Test-Path $indexPath) {
            Write-Host "    INDEX.HTM found (UF2 bootloader mode)"
        }
    }
}

Write-Section "Summary"
$rpCom = @($serialPorts | Where-Object { Test-Rp2350UsbId $_.PNPDeviceID })
$rpDrive = @($removable | Where-Object { $_.FileSystemLabel -match "RPI|RP2|Pico|Raspberry" })

if ($rpCom.Count -gt 0) {
    Write-Host ("  Serial (MicroPython REPL / Thonny): {0}" -f ($rpCom.DeviceID -join ", ")) -ForegroundColor Green
} else {
    Write-Host "  Serial: no Raspberry Pi VID_2E8A port found" -ForegroundColor Yellow
}

if ($rpDrive.Count -gt 0) {
    $letters = ($rpDrive | ForEach-Object { "{0}:" -f $_.DriveLetter }) -join ", "
    Write-Host ("  UF2 drive (flash firmware): {0}" -f $letters) -ForegroundColor Green
} else {
    Write-Host "  UF2 drive: not mounted (hold BOOT + USB to flash .uf2)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Thonny: MicroPython (Raspberry Pi Pico) -> port above"
Write-Host "  2. PoE/LAN cable -> DHCP on home network"
Write-Host "  3. Upload rp2350/firmware/* to board root (see rp2350/firmware/README.md)"
Write-Host ""
