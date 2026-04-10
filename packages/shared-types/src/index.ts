export interface User {
  id: string;
  telegramId?: string;
  username: string;
  email?: string;
  avatarUrl?: string;
  /** 虾米积分；未返回时视为 0 */
  clawPoints?: number;
  /** 站内管理员；仅本人可见，用于前端展示管理入口 */
  isAdmin?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type LiveMode = 'video' | 'audio';

export interface Room {
  id: string;
  hostId: string;
  title: string;
  description?: string;
  lobsterName: string;
  isLive: boolean;
  liveMode?: LiveMode;
  privacyFilters: string[];
  dashboardUrl?: string;
  viewerCount: number;
  createdAt: Date;
  startedAt?: Date;
  endedAt?: Date;
  /** Optional; included when room is fetched from API */
  host?: {
    id: string;
    username: string;
    avatarUrl?: string;
  };
}

export type MessageSender = 'user' | 'agent' | 'system';

export interface Message {
  id: string;
  roomId: string;
  sender: MessageSender;
  content: string;
  metadata?: {
    tokens?: number;
    model?: string;
    filtered?: boolean;
  };
  timestamp: Date;
}

export interface Comment {
  id: string;
  roomId: string;
  userId?: string;
  nickname: string;
  content: string;
  timestamp: Date;
}

export type AgentLogStatus = 'pending' | 'success' | 'error';

export interface AgentLog {
  id: string;
  roomId: string;
  action: string;
  status: AgentLogStatus;
  details?: Record<string, any>;
  timestamp: Date;
}

export interface Screenshot {
  id: string;
  roomId: string;
  imageUrl: string;
  caption?: string;
  timestamp: Date;
}

export interface RoomListItem {
  id: string;
  title: string;
  lobsterName: string;
  description?: string;
  viewerCount: number;
  isLive: boolean;
  startedAt?: Date;
  host: {
    id: string;
    username: string;
    avatarUrl?: string;
  };
  hostUsername?: string; // Deprecated: use host.username
}

export interface CreateRoomRequest {
  id: string;
  title: string;
  description?: string;
  lobsterName: string;
  dashboardUrl?: string;
}

export interface UpdateRoomRequest {
  title?: string;
  description?: string;
  privacyFilters?: string[];
  dashboardUrl?: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  user: User;
  token: string;
  refreshToken: string;
}

export interface WebhookMessagePayload {
  sender: MessageSender;
  content: string;
  timestamp: string;
  metadata?: {
    tokens?: number;
    model?: string;
  };
}

export interface WebhookLogPayload {
  action: string;
  status: AgentLogStatus;
  details?: Record<string, any>;
}

export interface WebhookScreenshotPayload {
  imageBase64: string;
  caption?: string;
}

/** Agent Viewer: AI agents that subscribe to live/work content for learning */
export interface AgentViewerRegisterRequest {
  agentId: string;
  name?: string;
  webhookUrl?: string;
}

export interface AgentViewerRegisterResponse {
  agentId: string;
  apiKey: string;
  message: string;
}

export interface AgentViewerSubscriptions {
  agentId: string;
  roomIds: string[];
  workIds: string[];
}

export interface AgentViewerFeedItem {
  id: string;
  roomId?: string;
  workId?: string;
  sender: string;
  content: string;
  timestamp: Date;
  type: 'message';
}

/** Darwin 首次申请问卷（5 单选 + 1 填空），用于用户画像 */
export interface DarwinOnboardingAnswers {
  q1: 'A' | 'B' | 'C' | 'D' | 'E';
  q2: 'A' | 'B' | 'C' | 'D' | 'E';
  q3: 'A' | 'B' | 'C' | 'D';
  q4: 'A' | 'B' | 'C' | 'D';
  q5: 'A' | 'B' | 'C' | 'D';
  q6: string;
}

/** 持久化时附带版本号，便于以后升级题目 */
export type DarwinOnboardingStored = DarwinOnboardingAnswers & { v: number };

export interface SocketEvents {
  'join-room': { roomId: string; role?: 'host' | 'viewer' | 'agent'; agentId?: string } | string;
  'leave-room': { roomId: string } | string;
  'join-work': { workId: string; role?: 'viewer' | 'agent'; agentId?: string } | string;
  'leave-work': { workId: string } | string;
  'send-comment': { roomId: string; content: string; nickname: string };
  'message-history': Message[];
  'new-message': Message;
  'new-log': AgentLog;
  'new-screenshot': Screenshot;
  'new-comment': Comment;
  'viewer-count-update': number;
  'room-status-change': { isLive: boolean; liveMode?: LiveMode; startedAt?: Date; endedAt?: Date };
}
