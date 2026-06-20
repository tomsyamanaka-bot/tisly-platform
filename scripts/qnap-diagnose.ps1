# TiSLY MotherShip - QNAP connection diagnose (Phase 5)
param(
  [string]$QnapShare = "\\192.168.1.10\TiSLY",
  [string]$RepoRoot = "",
  [int]$SpeedTestBytes = 1048576
)

$ErrorActionPreference = "Stop"

function Get-RepoRootPath {
  param([string]$Hint)
  if ($Hint -and (Test-Path $Hint)) { return (Resolve-Path $Hint).Path }
  $here = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $PSCommandPath }
  return (Resolve-Path (Join-Path $here "..")).Path
}

function Format-ByteSize {
  param([long]$Bytes)
  if ($Bytes -ge 1TB) { return "{0:N2} TB" -f ($Bytes / 1TB) }
  if ($Bytes -ge 1GB) { return "{0:N2} GB" -f ($Bytes / 1GB) }
  if ($Bytes -ge 1MB) { return "{0:N2} MB" -f ($Bytes / 1MB) }
  return "{0:N0} bytes" -f $Bytes
}

$startedAt = Get-Date
$repoRoot = Get-RepoRootPath -Hint $RepoRoot
$reportDir = Join-Path $repoRoot "server\data\mothership-diagnose"
New-Item -ItemType Directory -Force -Path $reportDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$reportFile = Join-Path $reportDir "diagnose-$stamp.json"

$checks = @{}
$overallOk = $true

$connOk = Test-Path $QnapShare
$connMessage = "share not reachable"
if ($connOk) { $connMessage = "share reachable" }
$checks["connection"] = @{
  ok = $connOk
  path = $QnapShare
  message = $connMessage
}
if (-not $connOk) { $overallOk = $false }

$freeBytes = $null
$totalBytes = $null
$usedPercent = $null
if ($connOk) {
  try {
    $drive = New-Object System.IO.DriveInfo($QnapShare)
    if ($drive.IsReady) {
      $freeBytes = $drive.AvailableFreeSpace
      $totalBytes = $drive.TotalSize
      if ($totalBytes -gt 0) {
        $usedPercent = [math]::Round((1 - ($freeBytes / $totalBytes)) * 100, 1)
      }
    }
  } catch {
    try {
      $uncRoot = $QnapShare.TrimEnd('\')
      $filter = "ProviderName='$uncRoot'"
      $wmi = Get-WmiObject Win32_LogicalDisk -Filter $filter -ErrorAction Stop
      if ($wmi) {
        $freeBytes = [long]$wmi.FreeSpace
        $totalBytes = [long]$wmi.Size
        if ($totalBytes -gt 0) {
          $usedPercent = [math]::Round((1 - ($freeBytes / $totalBytes)) * 100, 1)
        }
      }
    } catch {
      # ignore WMI fallback failure
    }
  }
}

$freeHuman = $null
$totalHuman = $null
if ($null -ne $freeBytes) { $freeHuman = Format-ByteSize $freeBytes }
if ($null -ne $totalBytes) { $totalHuman = Format-ByteSize $totalBytes }

$checks["freeSpace"] = @{
  ok = ($null -ne $freeBytes)
  freeBytes = $freeBytes
  freeHuman = $freeHuman
  totalBytes = $totalBytes
  totalHuman = $totalHuman
  usedPercent = $usedPercent
}

$writeOk = $false
$readOk = $false
$writeMbps = $null
$readMbps = $null
$testDir = Join-Path $QnapShare "Backups\_diagnose"
$testFile = Join-Path $testDir "tisly-diagnose-$stamp.bin"

if ($connOk) {
  try {
    New-Item -ItemType Directory -Force -Path $testDir | Out-Null
    $payload = New-Object byte[] $SpeedTestBytes
    (New-Object System.Random).NextBytes($payload)

    $swWrite = [System.Diagnostics.Stopwatch]::StartNew()
    [System.IO.File]::WriteAllBytes($testFile, $payload)
    $swWrite.Stop()
    $writeOk = Test-Path $testFile
    $writeSec = [math]::Max($swWrite.Elapsed.TotalSeconds, 0.001)
    $writeMbps = [math]::Round(($SpeedTestBytes * 8 / 1MB) / $writeSec, 2)

    $swRead = [System.Diagnostics.Stopwatch]::StartNew()
    $readBack = [System.IO.File]::ReadAllBytes($testFile)
    $swRead.Stop()
    $readOk = ($readBack.Length -eq $payload.Length)
    $readSec = [math]::Max($swRead.Elapsed.TotalSeconds, 0.001)
    $readMbps = [math]::Round(($SpeedTestBytes * 8 / 1MB) / $readSec, 2)

    Remove-Item $testFile -Force -ErrorAction SilentlyContinue
  } catch {
    $checks["writeError"] = $_.Exception.Message
    $overallOk = $false
  }
} else {
  $overallOk = $false
}

$checks["write"] = @{
  ok = $writeOk
  testFile = $testFile
  bytes = $SpeedTestBytes
  speedMbps = $writeMbps
}
$checks["read"] = @{
  ok = $readOk
  speedMbps = $readMbps
}

if ((-not $writeOk) -or (-not $readOk)) { $overallOk = $false }

$expectedFolders = @(
  "AI", "Backups", "Customers", "Documents", "ESP", "Estimates",
  "Photos", "PLC", "Projects", "Reports", "Scan", "SiteMaps"
)
$folderStatus = @{}
foreach ($f in $expectedFolders) {
  $p = Join-Path $QnapShare $f
  $folderStatus[$f] = Test-Path $p
}

$finishedAt = Get-Date
$report = @{
  ok = $overallOk
  startedAt = $startedAt.ToString("o")
  finishedAt = $finishedAt.ToString("o")
  durationSec = [math]::Round(($finishedAt - $startedAt).TotalSeconds, 1)
  qnapShare = $QnapShare
  nasName = "TiSLYNAS"
  fixedIp = "192.168.1.10"
  checks = $checks
  mothershipFolders = $folderStatus
  reportFile = $reportFile
}

$report | ConvertTo-Json -Depth 6 | Set-Content -Path $reportFile -Encoding UTF8

Write-Host "=== TiSLY QNAP Diagnose ==="
Write-Host "share: $QnapShare"
Write-Host "connection: $connOk"
Write-Host "write: $writeOk read: $readOk"
if ($null -ne $freeBytes) { Write-Host "free: $freeHuman" }
Write-Host "report: $reportFile"

if (-not $overallOk) { exit 1 }
exit 0
