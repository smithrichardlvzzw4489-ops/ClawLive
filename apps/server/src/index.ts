import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { resolve } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { UPLOADS_DIR } from './lib/data-path';
import { initRoomsStore } from './lib/rooms-store';
import { setupSocketIO } from './socket/index-simple';
import { setupRoutes } from './api/routes';
import { errorHandler } from './api/middleware/errorHandler';
import { mtprotoService } from './services/telegram-mtproto';
import { startScheduler, setTaskRunner } from './services/lobster-scheduler';
import { startContentCurator } from './services/lobster-content-curator';
import {
  EVOLUTION_TRANSITION_TICK_MS,
  initEvolutionNetwork,
} from './services/evolution-network-service';

// 捕获未处理异常，便于 Railway 等平台排查部署崩溃
process.on('uncaughtException', (err) => {
  console.error('[FATAL] uncaughtException:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] unhandledRejection:', reason);
  process.exit(1);
});

dotenv.config({ path: resolve(__dirname, '../.env') });
console.log('[ClawLive] Server bootstrap starting...');

console.log('[Env] TELEGRAM_API_ID:', process.env.TELEGRAM_API_ID || '(使用内置默认)');
console.log('[Env] TELEGRAM_API_HASH:', process.env.TELEGRAM_API_HASH ? 'SET' : '(使用内置默认)');

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

// 允许 *.vercel.app、clawlab.live、clawclub.live 及其子域名
function corsOriginFn(origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) {
  if (!origin) return cb(null, true);
  if (corsOrigins.includes(origin)) return cb(null, true);
  if (origin.endsWith('.vercel.app')) return cb(null, true);
  if (origin === 'https://clawlab.live' || origin === 'https://www.clawlab.live') return cb(null, true);
  if (origin.endsWith('.clawlab.live')) return cb(null, true);
  if (origin === 'https://clawclub.live' || origin === 'https://www.clawclub.live') return cb(null, true);
  if (origin.endsWith('.clawclub.live')) return cb(null, true);
  cb(null, false);
}

const io = new Server(httpServer, {
  cors: { origin: corsOriginFn, credentials: true },
});

app.use(helmet());
app.use(cors({ origin: corsOriginFn, credentials: true }));
app.use(express.json({
  limit: '100mb',
  verify: (req, _res, buf) => {
    (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
  },
}));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
app.use(morgan('dev'));

if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOADS_DIR));

const PORT = Number(process.env.PORT || process.env.SERVER_PORT || 3001);

// 先 listen，通过健康检查后再加载路由（避免 setupRoutes 等阻塞/崩溃导致无法监听）
httpServer.listen(PORT, '0.0.0.0', async () => {
  console.log(`[ClawLive] Server running on http://0.0.0.0:${PORT}`);
  try {
    await initRoomsStore();
    setupRoutes(app, io);
    setupSocketIO(io);
    mtprotoService.setSocketIO(io);
    // 定时任务调度器（定时提醒功能）
    setTaskRunner(async (schedule) => {
      console.log(`[Scheduler] Executing task for user ${schedule.userId}: ${schedule.task}`);
    });
    startScheduler();
    startContentCurator();
    try {
      initEvolutionNetwork();
    } catch (e) {
      console.error('[Evolution] initial init:', e);
    }
    setInterval(() => {
      try {
        initEvolutionNetwork();
      } catch (e) {
        console.error('[Evolution] transition tick:', e);
      }
    }, EVOLUTION_TRANSITION_TICK_MS);
    app.use(errorHandler);
    console.log(`[ClawLive] Socket.io ready for connections`);
  } catch (err) {
    console.error('[FATAL] Startup error:', err);
    process.exit(1);
  }
});

export { io };
