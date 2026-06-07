# Phase 2383 — Gmail 通知経路確認（Windows / PowerShell）
param(
  [Parameter(Mandatory = $true)]
  [string]$AdminPassword,
  [string]$BaseUrl = "https://tisly.jp",
  [string]$AdminUser = "admin"
)

$ErrorActionPreference = "Stop"

Write-Host "=== Phase 2383 Gmail verify ==="
Write-Host "BASE_URL=$BaseUrl"

Write-Host "`n--- GET /api/notifications/stats ---"
$stats = Invoke-RestMethod -Uri "$BaseUrl/api/notifications/stats" -Method Get
$stats | ConvertTo-Json -Compress

Write-Host "`n--- GET /api/deploy/production-check ---"
try {
  $pc = Invoke-RestMethod -Uri "$BaseUrl/api/deploy/production-check" -Method Get
  $pc | Select-Object phase, adminPasswordStatus, operationalReady, gmailMode, smtpConfigured, notificationTestToConfigured, productionRatePercent | ConvertTo-Json -Compress
} catch {
  $legacy = Invoke-RestMethod -Uri "$BaseUrl/api/deploy/production-check-2381" -Method Get
  $legacy | Select-Object phase, adminPasswordStatus, operationalReady, productionRatePercent | ConvertTo-Json -Compress
}

Write-Host "`n--- POST /api/auth/login ---"
$loginBody = @{ username = $AdminUser; password = $AdminPassword } | ConvertTo-Json
$login = Invoke-RestMethod -Uri "$BaseUrl/api/auth/login" -Method Post -ContentType "application/json" -Body $loginBody
if (-not $login.token) { throw "Login failed: $($login | ConvertTo-Json -Compress)" }
Write-Host "login ok (token acquired)"

Write-Host "`n--- POST /api/notifications/test-email ---"
$headers = @{ Authorization = "Bearer $($login.token)" }
$result = Invoke-RestMethod -Uri "$BaseUrl/api/notifications/test-email" -Method Post -Headers $headers
$result | ConvertTo-Json -Compress

if (-not $result.ok) { throw "test-email returned ok:false — $($result.error)" }
Write-Host "`n=== Phase 2383 Gmail verify: SUCCESS ==="
