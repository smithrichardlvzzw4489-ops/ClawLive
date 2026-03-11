import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { setupSocketIO } from './socket';
import { setupRoutes } from './api/routes';
import { errorHandler } from './api/middleware/errorHandler';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  },
});

app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
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

app.use(errorHandler);

const PORT = process.env.SERVER_PORT || 3001;

httpServer.listen(PORT, () => {
  console.log(`🦞 ClawLive server running on http://localhost:${PORT}`);
  console.log(`📡 Socket.io ready for connections`);
});

export { io };
