#!/usr/bin/env python3
"""
ClawLive Webhook Python 客户端示例
用于从 Python 脚本推送数据到 ClawLive
"""

import hashlib
import hmac
import json
import requests
from datetime import datetime
from typing import Dict, Any, Optional


class ClawLiveClient:
    def __init__(self, api_url: str, room_id: str, webhook_secret: str):
        self.api_url = api_url.rstrip('/')
        self.room_id = room_id
        self.webhook_secret = webhook_secret

    def _generate_signature(self, body: str) -> str:
        """生成 HMAC-SHA256 签名"""
        return hmac.new(
            self.webhook_secret.encode(),
            body.encode(),
            hashlib.sha256
        ).hexdigest()

    def _send_webhook(self, endpoint: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        """发送 Webhook 请求"""
        url = f"{self.api_url}/api/webhooks/openclaw/{self.room_id}/{endpoint}"
        body = json.dumps(payload, separators=(',', ':'))
        signature = self._generate_signature(body)

        headers = {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': signature,
        }

        response = requests.post(url, data=body, headers=headers)
        response.raise_for_status()
        return response.json()

    def send_message(
        self,
        sender: str,
        content: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """发送聊天消息"""
        payload = {
            'sender': sender,
            'content': content,
            'timestamp': datetime.utcnow().isoformat() + 'Z',
        }
        if metadata:
            payload['metadata'] = metadata

        return self._send_webhook('message', payload)

    def send_log(
        self,
        action: str,
        status: str,
        details: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """发送 Agent 日志"""
        payload = {
            'action': action,
            'status': status,
        }
        if details:
            payload['details'] = details

        return self._send_webhook('log', payload)

    def send_screenshot(
        self,
        image_base64: str,
        caption: Optional[str] = None
    ) -> Dict[str, Any]:
        """发送浏览器截图"""
        payload = {
            'imageBase64': image_base64,
        }
        if caption:
            payload['caption'] = caption

        return self._send_webhook('screenshot', payload)


# 使用示例
if __name__ == '__main__':
    client = ClawLiveClient(
        api_url='http://localhost:3001',
        room_id='test-room',
        webhook_secret='dev-webhook-secret-change-in-production'
    )

    # 发送用户消息
    print('📤 发送用户消息...')
    result = client.send_message(
        sender='user',
        content='你好龙虾，帮我查一下天气'
    )
    print(f'✅ 消息已发送: {result}')

    # 发送 Agent 日志
    print('\n📤 发送 Agent 日志...')
    result = client.send_log(
        action='正在查询天气',
        status='pending'
    )
    print(f'✅ 日志已发送: {result}')

    # 发送成功日志
    print('\n📤 发送成功日志...')
    result = client.send_log(
        action='查询天气完成',
        status='success',
        details={
            'location': '北京',
            'temperature': '15°C',
            'weather': '晴'
        }
    )
    print(f'✅ 日志已发送: {result}')

    # 发送 Agent 回复
    print('\n📤 发送 Agent 回复...')
    result = client.send_message(
        sender='agent',
        content='北京今天天气晴，温度 15°C',
        metadata={
            'tokens': 50,
            'model': 'gpt-4'
        }
    )
    print(f'✅ 消息已发送: {result}')

    print('\n🎉 测试完成！访问 http://localhost:3000/rooms/test-room 查看结果')
