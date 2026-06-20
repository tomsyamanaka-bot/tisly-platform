# TiSLY MotherShip — 統合デプロイ (Phase 2)
# README確認 → lint → test → build → commit → push → QNAP Backup → health → レポート
param(
  [string]$CommitMessage = "",
  [string]$HealthUrl = "https://tisly.jp/api/health",
  [string]$QnapShare = "\\192.168.1.10\TiSLY",
  [switch]$SkipCommit,
  [switch]$SkipPush,
  [switch]$SkipQnapBackup,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Get-RepoRoot {
  $here = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $PSCommandPath }
  return (Resolve-Path (Join-Path $here "..")).Path
}

function Add-Step {
  param(
    [string]$Name,
    [bool]$Ok,
    [string]$Detail = ""
  )
  $script:Steps += [ordered]@{
    name = $Name
    ok = $Ok
    detail = $Detail
    at = (Get-Date).ToString("o")
  }
  if (-not $Ok) { $script:OverallOk = $false }
  $icon = if ($Ok) { "OK" } else { "NG" }
  Write-Host "[$icon] $Name $(if ($Detail) { "- $Detail" })"
}

$startedAt = Get-Date
$repoRoot = Get-RepoRoot
$serverDir = Join-Path $repoRoot "server"
$reportDir = Join-Path $repoRoot "server\data\mothership-deploy"
New-Item -ItemType Directory -Force -Path $reportDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$reportFile = Join-Path $reportDir "deploy-all-$stamp.json"

$Steps = @()
$OverallOk = $true

Write-Host "=== TiSLY deploy-all (MotherShip integrated) ==="
Write-Host "repoRoot=$repoRoot"

# 1) README 確認
$readmePath = Join-Path $repoRoot "README.md"
$autonomousReadme = Join-Path $repoRoot "docs\autonomous\README.md"
$readmeOk = (Test-Path $readmePath) -and (Test-Path $autonomousReadme)
Add-Step -Name "README check" -Ok $readmeOk -Detail "README.md + docs/autonomous/README.md"

# 2) lint (tsc --noEmit)
Push-Location $serverDir
try {
  & npx tsc --noEmit 2>&1 | Tee-Object -Variable lintOut | Out-Host
  $lintOk = ($LASTEXITCODE -eq 0)
  Add-Step -Name "lint (tsc --noEmit)" -Ok $lintOk
} catch {
  Add-Step -Name "lint (tsc --noEmit)" -Ok $false -Detail $_.Exception.Message
} finally {
  Pop-Location
}

# 3) test
Push-Location $serverDir
try {
  & npm run test 2>&1 | Tee-Object -Variable testOut | Out-Host
  $testOk = ($LASTEXITCODE -eq 0)
  Add-Step -Name "test (npm run test)" -Ok $testOk
} catch {
  Add-Step -Name "test (npm run test)" -Ok $false -Detail $_.Exception.Message
} finally {
  Pop-Location
}

# 4) build
Push-Location $repoRoot
try {
  & npm run build 2>&1 | Tee-Object -Variable buildOut | Out-Host
  $buildOk = ($LASTEXITCODE -eq 0)
  Add-Step -Name "build (npm run build)" -Ok $buildOk
} catch {
  Add-Step -Name "build (npm run build)" -Ok $false -Detail $_.Exception.Message
} finally {
  Pop-Location
}

if (-not $OverallOk) {
  Write-Host "deploy-all aborted before commit (lint/test/build failed)"
  $report = @{
    ok = $false
    aborted = "pre-commit"
    startedAt = $startedAt.ToString("o")
    finishedAt = (Get-Date).ToString("o")
    steps = $Steps
    reportFile = $reportFile
  }
  $report | ConvertTo-Json -Depth 6 | Set-Content -Path $reportFile -Encoding UTF8
  exit 1
}

# 5) commit
$commitHash = $null
$commitOk = $true
if (-not $SkipCommit -and -not $DryRun) {
  Push-Location $repoRoot
  try {
    $status = git status --porcelain
    if ($status) {
      if (-not $CommitMessage) {
        $CommitMessage = "Update TiSLY MotherShip integration $(Get-Date -Format 'yyyy-MM-dd')"
      }
      git add README.md docs/autonomous/PROJECT_STATUS.md docs/mothership.md `
        scripts/backup-qnap.ps1 scripts/deploy-all.ps1 scripts/qnap-diagnose.ps1 `
        server/src/storage/mothership-paths-v1.ts server/test/mothership-paths-v1.test.ts `
        server/package.json
      git commit -m $CommitMessage 2>&1 | Out-Host
      $commitOk = ($LASTEXITCODE -eq 0)
      $commitHash = (git rev-parse --short HEAD).Trim()
    } else {
      $commitHash = (git rev-parse --short HEAD).Trim()
      Write-Host "[SKIP] commit — working tree clean"
    }
    Add-Step -Name "commit" -Ok $commitOk -Detail $commitHash
  } catch {
    Add-Step -Name "commit" -Ok $false -Detail $_.Exception.Message
  } finally {
    Pop-Location
  }
} else {
  Add-Step -Name "commit" -Ok $true -Detail "skipped"
}

# 6) push
$pushOk = $true
if (-not $SkipPush -and -not $DryRun -and $commitOk) {
  Push-Location $repoRoot
  try {
    git push origin master 2>&1 | Out-Host
    $pushOk = ($LASTEXITCODE -eq 0)
    Add-Step -Name "push (origin master)" -Ok $pushOk
  } catch {
    Add-Step -Name "push (origin master)" -Ok $false -Detail $_.Exception.Message
  } finally {
    Pop-Location
  }
} else {
  Add-Step -Name "push (origin master)" -Ok $true -Detail "skipped"
}

# 7) QNAP Backup
$backupOk = $true
$backupReport = $null
if (-not $SkipQnapBackup -and -not $DryRun) {
  $backupScript = Join-Path $repoRoot "scripts\backup-qnap.ps1"
  $diagScript = Join-Path $repoRoot "scripts\qnap-diagnose.ps1"
  try {
    & $diagScript -QnapShare $QnapShare -RepoRoot $repoRoot 2>&1 | Out-Host
    & $backupScript -QnapShare $QnapShare -RepoRoot $repoRoot -SkipDiagnose 2>&1 | Out-Host
    $backupOk = ($LASTEXITCODE -eq 0)
    $latestBackup = Get-ChildItem (Join-Path $repoRoot "server\data\mothership-backup") -Filter "backup-*.json" |
      Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($latestBackup) { $backupReport = $latestBackup.FullName }
    Add-Step -Name "QNAP backup" -Ok $backupOk -Detail $backupReport
  } catch {
    $backupOk = $false
    Add-Step -Name "QNAP backup" -Ok $false -Detail $_.Exception.Message
  }
} else {
  Add-Step -Name "QNAP backup" -Ok $true -Detail "skipped"
}

# 8) health 確認
$healthOk = $false
$healthCommit = $null
$healthBody = $null
try {
  $healthBody = Invoke-RestMethod -Uri $HealthUrl -Method Get -TimeoutSec 30
  $healthCommit = $healthBody.commitShort
  if ($commitHash) {
    $healthOk = ($healthCommit -eq $commitHash)
  } else {
    $healthOk = $true
  }
  Add-Step -Name "health ($HealthUrl)" -Ok $healthOk -Detail "commitShort=$healthCommit"
} catch {
  Add-Step -Name "health ($HealthUrl)" -Ok $false -Detail $_.Exception.Message
}

$finishedAt = Get-Date
$report = @{
  ok = $OverallOk
  startedAt = $startedAt.ToString("o")
  finishedAt = $finishedAt.ToString("o")
  durationSec = [math]::Round(($finishedAt - $startedAt).TotalSeconds, 1)
  commitHash = $commitHash
  healthUrl = $HealthUrl
  healthCommitShort = $healthCommit
  healthMatch = $healthOk
  health = $healthBody
  backupReport = $backupReport
  steps = $Steps
  reportFile = $reportFile
}

$report | ConvertTo-Json -Depth 8 | Set-Content -Path $reportFile -Encoding UTF8

Write-Host ""
Write-Host "=== deploy-all report ==="
Write-Host "report: $reportFile"
Write-Host "overall: $(if ($OverallOk) { 'OK' } else { 'NG' })"

if (-not $OverallOk) { exit 1 }
exit 0
