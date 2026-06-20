# TiSLY MotherShip - QNAP Backup Engine (Phase 1)
param(
  [string]$QnapShare = "\\192.168.1.10\TiSLY",
  [string]$DestSubDir = "Backups\repo-mirror",
  [string]$RepoRoot = "",
  [switch]$SkipDiagnose
)

$ErrorActionPreference = "Stop"

function Get-RepoRootPath {
  param([string]$Hint)
  if ($Hint -and (Test-Path $Hint)) { return (Resolve-Path $Hint).Path }
  $here = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $PSCommandPath }
  return (Resolve-Path (Join-Path $here "..")).Path
}

function Write-LogLine {
  param([string]$LogFile, [string]$Message)
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
  Add-Content -Path $LogFile -Value $line -Encoding UTF8
  Write-Host $line
}

$startedAt = Get-Date
$repoRoot = Get-RepoRootPath -Hint $RepoRoot
$destRoot = Join-Path $QnapShare $DestSubDir
$logDir = Join-Path $repoRoot "server\data\mothership-backup"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
New-Item -ItemType Directory -Force -Path $destRoot -ErrorAction SilentlyContinue | Out-Null

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$logFile = Join-Path $logDir "backup-$stamp.log"
$reportFile = Join-Path $logDir "backup-$stamp.json"

Write-LogLine $logFile "=== TiSLY QNAP Backup Engine ==="
Write-LogLine $logFile "repoRoot=$repoRoot"
Write-LogLine $logFile "destRoot=$destRoot"

if (-not $SkipDiagnose) {
  if (-not (Test-Path $QnapShare)) {
    $msg = "QNAP share not reachable: $QnapShare"
    Write-LogLine $logFile "ERROR: $msg"
    $report = @{
      ok = $false
      startedAt = $startedAt.ToString("o")
      finishedAt = (Get-Date).ToString("o")
      qnapShare = $QnapShare
      destRoot = $destRoot
      error = $msg
      logFile = $logFile
    }
    $report | ConvertTo-Json -Depth 5 | Set-Content -Path $reportFile -Encoding UTF8
    throw $msg
  }
}

$excludeDirs = @(
  ".git", "node_modules", ".next", "dist", "build", "coverage", ".turbo", ".vercel"
)

Write-LogLine $logFile "robocopy mirror start (exclude: $($excludeDirs -join ', '))"

$robocopyLog = Join-Path $logDir "robocopy-$stamp.log"
$robocopyArgs = @(
  $repoRoot,
  $destRoot,
  "/MIR",
  "/Z",
  "/FFT",
  "/R:2",
  "/W:3",
  "/NP",
  "/NDL",
  "/NFL",
  "/LOG+:$robocopyLog"
)
foreach ($dir in $excludeDirs) {
  $robocopyArgs += "/XD"
  $robocopyArgs += $dir
}

& robocopy @robocopyArgs
$robocopyExit = $LASTEXITCODE

$robocopyOk = ($robocopyExit -ge 0 -and $robocopyExit -le 7)
Write-LogLine $logFile "robocopy exit code: $robocopyExit (ok=$robocopyOk)"
Write-LogLine $logFile "robocopy log: $robocopyLog"

$finishedAt = Get-Date
$durationSec = [math]::Round(($finishedAt - $startedAt).TotalSeconds, 1)

$report = @{
  ok = $robocopyOk
  startedAt = $startedAt.ToString("o")
  finishedAt = $finishedAt.ToString("o")
  durationSec = $durationSec
  qnapShare = $QnapShare
  destRoot = $destRoot
  repoRoot = $repoRoot
  robocopyExitCode = $robocopyExit
  robocopyLog = $robocopyLog
  logFile = $logFile
  excludedDirs = $excludeDirs
}

if (-not $robocopyOk) {
  $failLog = Join-Path $logDir "backup-failed-$stamp.log"
  Copy-Item -Path $robocopyLog -Destination $failLog -Force -ErrorAction SilentlyContinue
  Get-Content $robocopyLog -Tail 40 -ErrorAction SilentlyContinue | Add-Content $failLog
  $report["failLog"] = $failLog
  Write-LogLine $logFile "FAIL log copied: $failLog"
}

$report | ConvertTo-Json -Depth 6 | Set-Content -Path $reportFile -Encoding UTF8
Write-LogLine $logFile "report: $reportFile"
Write-LogLine $logFile "=== backup finished (ok=$robocopyOk) ==="

if (-not $robocopyOk) { exit 8 }
exit 0
