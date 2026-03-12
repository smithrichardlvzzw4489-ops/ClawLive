# 直播间内置 AI 对话功能实现方案

## 功能需求

主播在直播间页面直接和 AI 对话，观众实时观看整个对话过程。

---

## 实现步骤

### 步骤 1：添加 AI API 配置

在 `apps/server/.env` 中添加：

```bash
# OpenAI API 配置
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-4
OPENAI_BASE_URL=https://api.openai.com/v1

# 或使用其他兼容 OpenAI 的 API
# OPENAI_BASE_URL=https://your-custom-api.com/v1
```

### 步骤 2：安装 OpenAI SDK

```powershell
cd apps\server
pnpm add openai
```

### 步骤 3：创建 AI 服务

创建文件：`apps/server/src/services/ai.service.ts`

```typescript
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

export async function getAIResponse(
  userMessage: string,
  conversationHistory: Array<{ role: string; content: string }> = []
): Promise<string> {
  try {
    const messages = [
      {
        role: 'system',
        content: '你是一个helpful的AI助手，名叫三万龙虾。请简洁友好地回答问题。',
      },
      ...conversationHistory,
      {
        role: 'user',
        content: userMessage,
      },
    ];

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4',
      messages: messages as any,
      temperature: 0.7,
      max_tokens: 500,
    });

    return response.choices[0].message.content || '抱歉，我没有理解你的问题。';
  } catch (error) {
    console.error('AI API Error:', error);
    throw error;
  }
}
```

### 步骤 4：添加 API 端点

在 `apps/server/src/api/routes/rooms.ts` 中添加：

```typescript
// 主播发送消息并获取 AI 响应
router.post('/:roomId/chat', authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const { content } = req.body;
    const userId = req.user.userId;

    // 验证房间所有权
    const room = await prisma.room.findUnique({
      where: { id: roomId },
    });

    if (!room || room.hostId !== userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (!room.isLive) {
      return res.status(400).json({ error: 'Room is not live' });
    }

    // 1. 保存用户消息
    const userMessage = await prisma.message.create({
      data: {
        roomId,
        sender: 'user',
        content,
      },
    });

    // 2. 推送用户消息到所有观众
    io.to(roomId).emit('new-message', userMessage);

    // 3. 获取最近对话历史（用于 AI 上下文）
    const recentMessages = await prisma.message.findMany({
      where: { roomId },
      orderBy: { timestamp: 'desc' },
      take: 10,
    });

    const conversationHistory = recentMessages
      .reverse()
      .map((msg) => ({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.content,
      }));

    // 4. 调用 AI 获取响应
    const aiResponse = await getAIResponse(content, conversationHistory);

    // 5. 保存 AI 响应
    const agentMessage = await prisma.message.create({
      data: {
        roomId,
        sender: 'agent',
        content: aiResponse,
        metadata: {
          model: process.env.OPENAI_MODEL || 'gpt-4',
          tokens: aiResponse.length, // 简化计算
        },
      },
    });

    // 6. 推送 AI 响应到所有观众
    io.to(roomId).emit('new-message', agentMessage);

    res.json({ 
      userMessage, 
      agentMessage 
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Failed to process chat' });
  }
});
```

### 步骤 5：更新前端组件

在 `apps/web/src/components/LiveStream.tsx` 中添加主播输入区：

```typescript
// 在组件中添加状态
const [isHost, setIsHost] = useState(false);
const [message, setMessage] = useState('');
const [isSending, setIsSending] = useState(false);

// 检查是否是房主
useEffect(() => {
  const checkHost = async () => {
    try {
      const user = await api.getCurrentUser();
      setIsHost(user.id === room.hostId);
    } catch (error) {
      setIsHost(false);
    }
  };
  checkHost();
}, [room.hostId]);

// 发送消息函数
const sendMessage = async () => {
  if (!message.trim() || isSending) return;

  setIsSending(true);
  try {
    await api.post(`/rooms/${roomId}/chat`, {
      content: message.trim(),
    });
    setMessage('');
  } catch (error) {
    console.error('Failed to send message:', error);
    alert('发送失败，请重试');
  } finally {
    setIsSending(false);
  }
};

// 在 JSX 中添加主播输入区
{isHost && room.isLive && (
  <div className="border-t p-4 bg-blue-50">
    <div className="flex gap-2">
      <input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
        placeholder="输入消息与 AI 对话..."
        className="flex-1 px-4 py-2 border rounded-lg"
        disabled={isSending}
      />
      <button
        onClick={sendMessage}
        disabled={isSending || !message.trim()}
        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
      >
        {isSending ? '发送中...' : '发送'}
      </button>
    </div>
    <p className="text-xs text-gray-500 mt-1">
      主播专用 - 你的消息会发送给 AI，所有观众都能看到对话
    </p>
  </div>
)}
```

---

## 使用流程

### 1. 配置 API Key

```bash
# 编辑 .env
notepad apps\server\.env

# 添加你的 OpenAI API Key
OPENAI_API_KEY=sk-xxxxxx
```

### 2. 安装依赖

```powershell
cd apps\server
pnpm add openai
```

### 3. 重启服务器

```powershell
# 停止当前服务器（Ctrl+C）
# 重新启动
npx tsx src/index.ts
```

### 4. 开始直播

1. 进入你的直播间
2. 点击"开始直播"
3. 在主播输入框输入消息
4. AI 会自动响应
5. 观众看到完整对话！

---

## 功能特点

### ✅ 主播视角
- 专用输入框（蓝色背景区分）
- 发送消息自动获取 AI 响应
- 可以看到发送状态

### ✅ 观众视角
- 看到完整的人机对话
- 实时更新
- 可以发送弹幕互动

### ✅ AI 功能
- 记住对话历史（最近 10 条）
- 自动回复
- 显示模型和 token 信息

---

## 扩展功能

### 可以添加的功能：

1. **AI 模型选择**
   - 在创建房间时选择 AI 模型
   - 支持多种 AI 服务

2. **System Prompt 自定义**
   - 创建房间时设置 AI 人设
   - 例如："你是一个编程助手"、"你是一个翻译专家"

3. **对话历史长度**
   - 可配置保留多少条历史消息
   - 控制 token 消耗

4. **流式响应**
   - AI 响应逐字显示
   - 更真实的对话体验

---

## 成本考虑

### OpenAI API 费用

- **GPT-4**: ~$0.03/1K tokens
- **GPT-3.5-turbo**: ~$0.002/1K tokens
- **建议**: 测试时使用 GPT-3.5-turbo

### 节省成本的方法

1. 限制对话历史长度
2. 设置 max_tokens 上限
3. 使用更便宜的模型
4. 添加速率限制

---

## 替代方案

### 不使用 OpenAI

可以使用其他 AI 服务：

1. **国内服务**
   - 通义千问（阿里）
   - 文心一言（百度）
   - ChatGLM（智谱）

2. **开源模型**
   - 本地部署 Llama
   - Ollama

3. **其他云服务**
   - Claude (Anthropic)
   - Gemini (Google)

只需修改 `ai.service.ts` 中的 API 调用即可。

---

## 下一步

我来帮你实现这些代码！
