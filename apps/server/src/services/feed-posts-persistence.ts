/**
 * Feed 帖子类型（持久化由 feed-posts-store + PostgreSQL 完成）
 */
export type FeedPostRecord = {
  id: string;
  authorId: string;
  /** 缺省或 article：写文章（Markdown）；imageText：写图文（纯文字 + 独立图集） */
  kind?: 'article' | 'imageText';
  title: string;
  content: string;
  imageUrls: string[];
  viewCount: number;
  likeCount: number;
  /** 收藏数（与点赞分开统计） */
  favoriteCount: number;
  commentCount: number;
  createdAt: string;
  updatedAt?: string;
  /** 是否由 AI Agent 发布（自动采集或通过 Open API 发布） */
  publishedByAgent?: boolean;
  /** LLM 生成的摘要（无封面图时展示在卡片上） */
  excerpt?: string;
  /** 关联的进化点 ID（实验室发帖） */
  evolutionPointId?: string;
};
