/**
 * 服务端代发社区 Feed（与 Lobster publish_post 写入同一存储），供进化器等非对话场景使用。
 */
import { existsSync, mkdirSync } from 'fs';
import { writeFile as writeFileAsync } from 'fs/promises';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../lib/prisma';
import { UPLOADS_DIR } from '../lib/data-path';
import { generateCover } from './cover-generator';
import { getFeedPostsMap, saveFeedPosts } from './feed-posts-store';
import type { FeedPostRecord } from './feed-posts-persistence';
import { generateFeedPostExcerpt } from './llm';
import { getPoint, initEvolutionNetwork, touchActivityFromPublish } from './evolution-network-service';

function buildEvolverMarkdown(params: {
  roundNo: number;
  summary: string;
  selfAssessment: string;
  improvements: string[];
  githubLines: string[];
  evolutionPointId?: string;
}): string {
  const lines: string[] = [
    `## 第 ${params.roundNo} 轮 Darwin 进化纪要`,
    '',
    '### 能力评估摘要',
    params.summary.trim() || '（无）',
    '',
    '### 自我评估',
    params.selfAssessment.trim() || '（无）',
    '',
    '### 本轮改进方向',
    ...params.improvements.map((x, i) => `${i + 1}. ${x}`),
    '',
  ];
  if (params.githubLines.length) {
    lines.push('### 开源参考（GitHub）', ...params.githubLines.map((l) => `- ${l}`), '');
  }
  if (params.evolutionPointId) {
    lines.push(
      '### 关联进化点',
      `可在进化网络中继续协作：[查看进化点](/evolution-network/point/${params.evolutionPointId})`,
      '',
    );
  }
  lines.push('---', '*本帖由 Darwin 进化器在每轮结束时自动发布。*');
  return lines.join('\n');
}

/**
 * 发布一轮进化纪要到实验室 Feed，并可选关联「进化中」的进化点。
 */
export async function publishDarwinEvolverRoundPost(params: {
  userId: string;
  roundNo: number;
  summary: string;
  selfAssessment: string;
  improvements: string[];
  evolutionPointId?: string;
  githubLines?: string[];
}): Promise<{ ok: true; postId: string } | { ok: false; error: string }> {
  try {
    initEvolutionNetwork();

    let evoId: string | undefined = params.evolutionPointId?.trim() || undefined;
    if (evoId) {
      const ep = getPoint(evoId);
      if (!ep || ep.status === 'ended') {
        evoId = undefined;
      }
    }

    const gh = params.githubLines?.filter(Boolean) ?? [];
    const content = buildEvolverMarkdown({
      roundNo: params.roundNo,
      summary: params.summary,
      selfAssessment: params.selfAssessment,
      improvements: params.improvements.length ? params.improvements : ['（本轮无单独改进项）'],
      githubLines: gh,
      evolutionPointId: evoId,
    });

    const rawTitle = `Darwin 进化 · 第 ${params.roundNo} 轮`;
    const title = rawTitle.slice(0, 120);

    const id = uuidv4();
    const uploadDir = join(UPLOADS_DIR, 'feed-posts', id);
    if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });

    let imgUrl = '';
    try {
      const coverBuf = await generateCover(title, content.slice(0, 2000));
      const imgName = `cover-${uuidv4().slice(0, 8)}.png`;
      await writeFileAsync(join(uploadDir, imgName), coverBuf);
      imgUrl = `/uploads/feed-posts/${id}/${imgName}`;
    } catch (e) {
      console.error('[publishDarwinEvolverRoundPost] cover:', e);
    }

    const record: FeedPostRecord = {
      id,
      authorId: params.userId,
      kind: 'article',
      title,
      content: content.slice(0, 20000),
      imageUrls: imgUrl ? [imgUrl] : [],
      viewCount: 0,
      likeCount: 0,
      favoriteCount: 0,
      commentCount: 0,
      createdAt: new Date().toISOString(),
      publishedByAgent: true,
      ...(evoId ? { evolutionPointId: evoId } : {}),
    };

    getFeedPostsMap().set(id, record);
    saveFeedPosts();

    if (evoId) {
      touchActivityFromPublish(evoId);
    }

    void generateFeedPostExcerpt({ title, content: record.content })
      .then((excerpt) => {
        const p = getFeedPostsMap().get(id);
        if (p) {
          p.excerpt = excerpt;
          saveFeedPosts();
        }
      })
      .catch(() => {});

    try {
      await prisma.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id: params.userId },
          data: { clawPoints: { increment: 5 } },
          select: { clawPoints: true },
        });
        await tx.pointLedger.create({
          data: {
            userId: params.userId,
            delta: 5,
            balanceAfter: updated.clawPoints,
            reason: 'darwin_evolver_round_post',
            metadata: { postId: id, roundNo: params.roundNo },
          },
        });
      });
    } catch (e) {
      console.error('[publishDarwinEvolverRoundPost] points:', e);
    }

    console.log(`[Evolver] feed post published user=${params.userId} post=${id}`);
    return { ok: true, postId: id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[publishDarwinEvolverRoundPost]', e);
    return { ok: false, error: msg };
  }
}
