import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../lib/prisma';

export interface FeedPostCommentRecord {
  id: string;
  postId: string;
  authorId: string;
  content: string;
  createdAt: Date;
}

export async function getFeedPostComments(postId: string): Promise<FeedPostCommentRecord[]> {
  const rows = await prisma.feedPostComment.findMany({
    where: { postId },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((r) => ({
    id: r.id,
    postId: r.postId,
    authorId: r.authorId,
    content: r.content,
    createdAt: r.createdAt,
  }));
}

export async function addFeedPostComment(
  postId: string,
  authorId: string,
  content: string,
): Promise<FeedPostCommentRecord> {
  const trimmed = content.trim();
  if (!trimmed) throw new Error('empty');
  const id = `fpc-${Date.now()}-${uuidv4().slice(0, 8)}`;
  const row = await prisma.feedPostComment.create({
    data: {
      id,
      postId,
      authorId,
      content: trimmed.slice(0, 5000),
    },
  });
  return {
    id: row.id,
    postId: row.postId,
    authorId: row.authorId,
    content: row.content,
    createdAt: row.createdAt,
  };
}
