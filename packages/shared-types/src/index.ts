export interface User {
  id: string;
  telegramId?: string;
  username: string;
  email?: string;
  avatarUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Room {
  id: string;
  hostId: string;
  title: string;
  description?: string;
  lobsterName: string;
  isLive: boolean;
  privacyFilters: string[];
  dashboardUrl?: string;
  viewerCount: number;
  createdAt: Date;
  startedAt?: Date;
  endedAt?: Date;
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

export interface SocketEvents {
  'join-room': { roomId: string; role: 'host' | 'viewer' };
  'leave-room': { roomId: string };
  'send-comment': { roomId: string; content: string; nickname: string };
  'message-history': Message[];
  'new-message': Message;
  'new-log': AgentLog;
  'new-screenshot': Screenshot;
  'new-comment': Comment;
  'viewer-count-update': number;
  'room-status-change': { isLive: boolean; startedAt?: Date; endedAt?: Date };
}
