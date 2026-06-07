# Phase 2385 — Gmail PDF 添付テストメール確認（login → test-email → stats → production-check）
param(
  [Parameter(Mandatory = $true)]
  [string]$AdminPassword,
  [string]$BaseUrl = "https://tisly.jp",
  [string]$AdminUser = "admin"
)

$ErrorActionPreference = "Stop"

Write-Host "=== Phase 2385 Gmail PDF attachment verify ==="
Write-Host "BASE_URL=$BaseUrl"

Write-Host "`n--- GET /api/notifications/stats (before) ---"
$statsBefore = Invoke-RestMethod -Uri "$BaseUrl/api/notifications/stats" -Method Get
$statsBefore | Select-Object gmailMode, smtpConfigured, emailMode, lastSendStatus | ConvertTo-Json -Compress

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
if ($result.attachmentIncluded -ne $true) {
  throw "Expected attachmentIncluded=true, got: $($result.attachmentIncluded)"
}
Write-Host "PDF attachment: $($result.attachmentFileName)"
if ($result.mock -eq $true) {
  Write-Warning "test-email succeeded in MOCK mode — real SMTP send was not performed"
}

Write-Host "`n--- GET /api/notifications/stats (after) ---"
$statsAfter = Invoke-RestMethod -Uri "$BaseUrl/api/notifications/stats" -Method Get
$statsAfter | Select-Object gmailMode, smtpConfigured, lastSendStatus | ConvertTo-Json -Compress

$lastStatus = $statsAfter.lastSendStatus.status
if ($statsAfter.gmailMode -eq "real" -and $lastStatus -ne "sent") {
  throw "Expected lastSendStatus=sent in real mode, got: $lastStatus"
}

Write-Host "`n--- GET /api/deploy/production-check ---"
try {
  $pc = Invoke-RestMethod -Uri "$BaseUrl/api/deploy/production-check" -Method Get
} catch {
  $pc = Invoke-RestMethod -Uri "$BaseUrl/api/deploy/production-check-2384" -Method Get
}
$pc | Select-Object phase, adminPasswordStatus, operationalReady, gmailMode, smtpConfigured, pdfAttachmentEnabled, testEmailBodySafe, productionRatePercent, ready | ConvertTo-Json -Compress

Write-Host "`n=== Phase 2385 Gmail verify: SUCCESS ==="
Write-Host "受信メール確認:"
Write-Host "  - 件名: [TiSLY] Gmail 通知テスト"
Write-Host "  - 添付: tisly-gmail-test.pdf"
Write-Host "  - 本文: 送信時刻 + モード(real/mock) のみ（SMTP 情報なし）"
