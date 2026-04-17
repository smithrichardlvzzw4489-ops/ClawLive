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
import { mountSandboxPreview } from './api/routes/sandbox-preview';
import { errorHandler } from './api/middleware/errorHandler';
import { mtprotoService } from './services/telegram-mtproto';
import { startScheduler, setTaskRunner } from './services/lobster-scheduler';
import { startContentCurator } from './services/lobster-content-curator';
import {
  EVOLUTION_TRANSITION_TICK_MS,
  initEvolutionNetwork,
} from './services/evolution-network-service';
import {
  EVOLVER_GLOBAL_TICK_MS,
  runEvolverRoundsForAllDarwinUsers,
} from './services/darwin-evolver-service';
import { bootstrapPersistentStateFromPostgres } from './services/persistent-bootstrap';
import { syncAdminBootstrapFromEnv } from './services/admin-bootstrap';
import { syncRecruitmentProTierBootstrapFromEnv } from './services/recruitment-tier-bootstrap';
import { migrateLegacyCodernetInterfaceUsageFromDisk } from './services/codernet-interface-usage';
import { startRecruitmentWeeklyRecommendScheduler } from './services/recruitment-recommend';

/**
 * GramJS（telegram 包）在 MTProto 重连时会在内部 recv 循环里抛出
 * "Error: Not connected" 等，若未绑定到业务 await，会变成 unhandledRejection。
 * 全局 handler 若一律 process.exit(1)，会把整个 API 打死并表现为网关 502。
 */
function isGramJsTransientTransportRejection(reason: unknown): boolean {
  if (!reason) return false;
  const msg =
    reason instanceof Error
      ? reason.message
      : typeof reason === 'string'
        ? reason
        : '';
  const stack = reason instanceof Error ? reason.stack || '' : '';
  const fromGram =
    stack.includes('MTProtoSender') ||
    stack.includes('telegram/network') ||
    stack.includes('ConnectionTCPFull') ||
    stack.includes('telegram/client/') ||
    stack.includes('node_modules/telegram/') ||
    (stack.includes('.pnpm') && stack.includes('telegram@'));
  if (!fromGram) return false;
  if (msg === 'Not connected') return true;
  if (msg.includes('Connection closed while receiving')) return true;
  // updates.js 里抛出的 TIMEOUT 栈通常不含 MTProtoSender，但仍属 GramJS 瞬态
  if (msg === 'TIMEOUT' || msg.includes('TIMEOUT')) return true;
  return false;
}

// 捕获未处理异常，便于 Railway 等平台排查部署崩溃
process.on('uncaughtException', (err) => {
  console.error('[FATAL] uncaughtException:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  if (isGramJsTransientTransportRejection(reason)) {
    console.warn(
      '[WARN] unhandledRejection (ignored, GramJS transport):',
      reason instanceof Error ? reason.message : reason
    );
    return;
  }
  console.error('[FATAL] unhandledRejection:', reason);
  process.exit(1);
});

// 线上以平台注入的环境变量为准；本地可选：仓库根 .env → apps/server/.env（后者覆盖）
dotenv.config({ path: resolve(__dirname, '../../../.env') });
dotenv.config({ path: resolve(__dirname, '../.env'), override: true });
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
app.use(
  cors({
    origin: corsOriginFn,
    credentials: true,
    /** 便于浏览器跨域读取 LINK 搜索 `X-Request-Id` 等与日志对齐（否则 fetch 只能看到「简单响应头」）。 */
    exposedHeaders: ['X-Request-Id', 'X-Gitlink-Deploy-Commit', 'X-Gitlink-Link-Search-Stream'],
  }),
);
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
mountSandboxPreview(app);

const PORT = Number(process.env.PORT || process.env.SERVER_PORT || 3001);

// 先 listen，通过健康检查后再加载路由（避免 setupRoutes 等阻塞/崩溃导致无法监听）
httpServer.listen(PORT, '0.0.0.0', async () => {
  console.log(`[ClawLive] Server running on http://0.0.0.0:${PORT}`);
  try {
    await bootstrapPersistentStateFromPostgres();
    await migrateLegacyCodernetInterfaceUsageFromDisk();
    await syncAdminBootstrapFromEnv();
    await syncRecruitmentProTierBootstrapFromEnv();
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
    startRecruitmentWeeklyRecommendScheduler();
    try {
      initEvolutionNetwork();
    } catch (e) {
      console.error('[Evolution] initial init:', e);
    }
    void runEvolverRoundsForAllDarwinUsers().catch((e) => {
      console.error('[Evolver] initial run:', e);
    });

    setInterval(() => {
      try {
        initEvolutionNetwork();
      } catch (e) {
        console.error('[Evolution] transition tick:', e);
      }
    }, EVOLUTION_TRANSITION_TICK_MS);

    setInterval(() => {
      void runEvolverRoundsForAllDarwinUsers().catch((e) => {
        console.error('[Evolver] global tick:', e);
      });
    }, EVOLVER_GLOBAL_TICK_MS);
    app.use(errorHandler);
    console.log(`[ClawLive] Socket.io ready for connections`);
  } catch (err) {
    console.error('[FATAL] Startup error:', err);
    process.exit(1);
  }
});

export { io };
