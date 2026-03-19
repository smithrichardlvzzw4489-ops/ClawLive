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

dotenv.config({ path: resolve(__dirname, '../.env') });

console.log('[Env] TELEGRAM_API_ID:', process.env.TELEGRAM_API_ID || 'NOT SET');
console.log('[Env] TELEGRAM_API_HASH:', process.env.TELEGRAM_API_HASH ? 'SET' : 'NOT SET');

const app = express();
const httpServer = createServer(app);

// 健康检查放在最前，确保 Railway 能尽快通过
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));
app.get('/', (req, res) => res.json({ status: 'ok', service: 'clawlive-server' }));

const defaultOrigins = ['http://localhost:3000', 'http://localhost:3001'];
const extraOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean)
  : [];
const corsOrigins = [...defaultOrigins, ...extraOrigins];

// 允许所有 *.vercel.app 域名（Vercel 预览/生产）
function corsOriginFn(origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) {
  if (!origin) return cb(null, true);
  if (corsOrigins.includes(origin)) return cb(null, true);
  if (origin.endsWith('.vercel.app')) return cb(null, true);
  cb(null, false);
}

const io = new Server(httpServer, {
  cors: { origin: corsOriginFn, credentials: true },
});

app.use(helmet());
app.use(cors({ origin: corsOriginFn, credentials: true }));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
app.use(morgan('dev'));

const uploadsDir = join(process.cwd(), 'uploads');
if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

const PORT = Number(process.env.PORT || process.env.SERVER_PORT || 3001);

// 先 listen，通过健康检查后再加载路由（避免 setupRoutes 等阻塞/崩溃导致无法监听）
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[ClawLive] Server running on http://0.0.0.0:${PORT}`);
  setupRoutes(app, io);
  setupSocketIO(io);
  mtprotoService.setSocketIO(io);
  app.use(errorHandler);
  console.log(`[ClawLive] Socket.io ready for connections`);
});

export { io };
