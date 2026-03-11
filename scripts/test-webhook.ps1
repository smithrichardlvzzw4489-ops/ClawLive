# ClawLive Webhook 测试脚本 (PowerShell)
# 用于测试 OpenClaw Webhook 集成

param(
    [string]$RoomId = "test-room",
    [string]$ApiUrl = "http://localhost:3001",
    [string]$WebhookSecret = "dev-webhook-secret-change-in-production"
)

Write-Host "🦞 测试 ClawLive Webhook" -ForegroundColor Cyan
Write-Host "房间ID: $RoomId"
Write-Host "API URL: $ApiUrl"
Write-Host ""

function Get-HmacSignature {
    param([string]$Body, [string]$Secret)
    
    $hmac = New-Object System.Security.Cryptography.HMACSHA256
    $hmac.Key = [Text.Encoding]::UTF8.GetBytes($Secret)
    $hash = $hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($Body))
    return [BitConverter]::ToString($hash).Replace('-', '').ToLower()
}

# 测试消息推送
Write-Host "1️⃣ 测试消息推送..." -ForegroundColor Yellow
$timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.000Z")
$body = @{
    sender = "user"
    content = "测试消息：你好龙虾！"
    timestamp = $timestamp
} | ConvertTo-Json -Compress

$signature = Get-HmacSignature -Body $body -Secret $WebhookSecret

$headers = @{
    "Content-Type" = "application/json"
    "X-Webhook-Signature" = $signature
}

try {
    $response = Invoke-RestMethod -Uri "$ApiUrl/api/webhooks/openclaw/$RoomId/message" `
        -Method Post -Body $body -Headers $headers
    Write-Host "✅ 消息推送成功" -ForegroundColor Green
    Write-Host ($response | ConvertTo-Json)
} catch {
    Write-Host "❌ 消息推送失败: $_" -ForegroundColor Red
}

Write-Host ""

# 测试日志推送
Write-Host "2️⃣ 测试日志推送..." -ForegroundColor Yellow
$body = @{
    action = "打开浏览器"
    status = "success"
    details = @{
        url = "https://example.com"
    }
} | ConvertTo-Json -Compress

$signature = Get-HmacSignature -Body $body -Secret $WebhookSecret
$headers["X-Webhook-Signature"] = $signature

try {
    $response = Invoke-RestMethod -Uri "$ApiUrl/api/webhooks/openclaw/$RoomId/log" `
        -Method Post -Body $body -Headers $headers
    Write-Host "✅ 日志推送成功" -ForegroundColor Green
    Write-Host ($response | ConvertTo-Json)
} catch {
    Write-Host "❌ 日志推送失败: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "✅ 测试完成！访问 http://localhost:3000/rooms/$RoomId 查看结果" -ForegroundColor Cyan
