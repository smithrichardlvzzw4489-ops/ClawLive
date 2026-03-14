import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { resolve } from 'path';
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
const corsOrigins = ['http://localhost:3000', 'http://localhost:3001'];
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
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(morgan('dev'));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

setupRoutes(app, io);
setupSocketIO(io);

// 设置 MTProto 的 Socket.io 实例（用于推送 Agent 回复）
mtprotoService.setSocketIO(io);

app.use(errorHandler);

const PORT = process.env.SERVER_PORT || 3001;

httpServer.listen(PORT, () => {
  console.log(`[ClawLive] Server running on http://localhost:${PORT}`);
  console.log(`[ClawLive] Socket.io ready for connections`);
});

export { io };
