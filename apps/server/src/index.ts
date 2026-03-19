import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { resolve } from 'path';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { setupSocketIO } from './socket/index-simple';
import { setupRoutes } from './api/routes';
import { errorHandler } from './api/middleware/errorHandler';
import { mtprotoService } from './services/telegram-mtproto';

// 显式指定 .env 文件路径
dotenv.config({ path: resolve(__dirname, '../.env') });

console.log('[Env] TELEGRAM_API_ID:', process.env.TELEGRAM_API_ID || 'NOT SET');
console.log('[Env] TELEGRAM_API_HASH:', process.env.TELEGRAM_API_HASH ? 'SET' : 'NOT SET');

const app = express();
const httpServer = createServer(app);

// CORS: 支持环境变量 CORS_ORIGIN（逗号分隔），生产环境需配置 Vercel 前端域名
const defaultOrigins = ['http://localhost:3000', 'http://localhost:3001'];
const extraOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean)
  : [];
const corsOrigins = [...defaultOrigins, ...extraOrigins];

const io = new Server(httpServer, {
  cors: {
    origin: corsOrigins,
    credentials: true,
  },
});

app.use(helmet());
app.use(cors({
  origin: corsOrigins,
  credentials: true,
}));
// 视频 base64 可能较大，提高限制
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
app.use(morgan('dev'));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
}); // Railway 默认检查此路径

// 静态文件：作品视频上传目录（与 works 路由写入路径一致）
const uploadsDir = join(process.cwd(), 'uploads');
if (!existsSync(uploadsDir)) {
  mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

setupRoutes(app, io);
setupSocketIO(io);

// 设置 MTProto 的 Socket.io 实例（用于推送 Agent 回复）
mtprotoService.setSocketIO(io);

app.use(errorHandler);

// Railway/Render 等云平台会注入 PORT（env 为字符串，需转数字）
const PORT = Number(process.env.PORT || process.env.SERVER_PORT || 3001);

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[ClawLive] Server running on http://0.0.0.0:${PORT}`);
  console.log(`[ClawLive] Socket.io ready for connections`);
});

export { io };
