#!/bin/bash

# ClawLive Webhook 测试脚本
# 用于测试 OpenClaw Webhook 集成

ROOM_ID=${1:-"test-room"}
API_URL=${2:-"http://localhost:3001"}
WEBHOOK_SECRET=${3:-"dev-webhook-secret-change-in-production"}

echo "🦞 测试 ClawLive Webhook"
echo "房间ID: $ROOM_ID"
echo "API URL: $API_URL"
echo ""

# 测试消息推送
echo "1️⃣ 测试消息推送..."
BODY='{"sender":"user","content":"测试消息：你好龙虾！","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'"}'
SIGNATURE=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" | awk '{print $2}')

curl -X POST "$API_URL/api/webhooks/openclaw/$ROOM_ID/message" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: $SIGNATURE" \
  -d "$BODY"

echo -e "\n"

# 测试日志推送
echo "2️⃣ 测试日志推送..."
BODY='{"action":"打开浏览器","status":"success","details":{"url":"https://example.com"}}'
SIGNATURE=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" | awk '{print $2}')

curl -X POST "$API_URL/api/webhooks/openclaw/$ROOM_ID/log" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: $SIGNATURE" \
  -d "$BODY"

echo -e "\n"

echo "✅ 测试完成！访问 http://localhost:3000/rooms/$ROOM_ID 查看结果"
