# TiSLY RP2350 — MicroPython ファーム反映（USB / mpremote）
# 用法: powershell -ExecutionPolicy Bypass -File scripts/deploy-rp2350-firmware.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Fw = Join-Path $Root "rp2350\firmware"

$Files = @(
  "security_light.py",
  "main.py",
  "config.py"
)

Write-Host "=== TiSLY RP2350 firmware deploy ===" -ForegroundColor Cyan
Write-Host "Source: $Fw"

$probe = python -m mpremote connect auto exec "print('tisly-ok')" 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "RP2350 が USB 接続されていません（mpremote: no device）。" -ForegroundColor Yellow
  Write-Host "Thonny で接続するか、BOOT+USB 後に再実行してください。"
  Write-Host "手動コマンド例:"
  foreach ($f in $Files) {
    Write-Host ("  python -m mpremote connect auto cp `"{0}\{1}`" :{1}" -f $Fw, $f)
  }
  exit 2
}

foreach ($f in $Files) {
  $src = Join-Path $Fw $f
  if (-not (Test-Path $src)) { throw "Missing $src" }
  Write-Host "Uploading $f ..."
  python -m mpremote connect auto cp $src ":$f"
  if ($LASTEXITCODE -ne 0) { throw "Upload failed: $f" }
}

Write-Host "Resetting device..."
python -m mpremote connect auto reset
Write-Host "Done. Confirm Shell: DI confirm 250ms / fw 1.6.1" -ForegroundColor Green
