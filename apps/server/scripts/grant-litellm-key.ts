/**
 * 运维：调用 LiteLLM 为用户创建虚拟 Key 并写入 users.litellmVirtualKey；若已有 Key 则追加 USD 预算。
 *
 * 依赖环境（与线上一致）：DATABASE_URL、LITELLM_BASE_URL、LITELLM_MASTER_KEY；可选 LITELLM_MODELS。
 * 可选：GRANT_LLM_USD — 首次建 Key 的 max_budget（默认 2）；追加预算时同值。
 * 若不想配置本机 .env：在 Railway 等已配好 LiteLLM 的线上服务设 ADMIN_SECRET，用
 *   curl -X POST "https://你的API域名/api/admin/grant-litellm-key" -H "Content-Type: application/json" -H "X-Admin-Secret: $SECRET" -d "{\"latestWechatMp\":true}"
 *
 * 用法：
 *   pnpm exec tsx scripts/grant-litellm-key.ts <username>
 *   pnpm exec tsx scripts/grant-litellm-key.ts --user-id <uuid>
 *   pnpm exec tsx scripts/grant-litellm-key.ts --latest-wechat-mp
 */
import './load-server-env';
import { PrismaClient } from '@prisma/client';
import { config as appConfig } from '../src/config';
import {
  generateVirtualKey,
  increaseVirtualKeyBudget,
  isLitellmConfigured,
} from '../src/services/litellm-budget';

const prisma = new PrismaClient();

function parseUsd(): number {
  const raw = process.env.GRANT_LLM_USD ?? '2';
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : 2;
}

async function resolveUserId(): Promise<{ id: string; username: string }> {
  const a = process.argv[2];
  if (a === '--user-id' && process.argv[3]) {
    const u = await prisma.user.findUnique({
      where: { id: process.argv[3].trim() },
      select: { id: true, username: true },
    });
    if (!u) throw new Error(`User id not found: ${process.argv[3]}`);
    return u;
  }
  if (a === '--latest-wechat-mp') {
    const u = await prisma.user.findFirst({
      where: { wechatMpOpenid: { not: null } },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, username: true },
    });
    if (!u) throw new Error('No user with wechatMpOpenid');
    return u;
  }
  const username = a?.trim();
  if (!username) {
    throw new Error(
      'Usage: grant-litellm-key.ts <username> | --user-id <uuid> | --latest-wechat-mp',
    );
  }
  const u = await prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true },
  });
  if (!u) throw new Error(`User not found: ${username}`);
  return u;
}

async function main() {
  if (!isLitellmConfigured()) {
    console.error(
      [
        'LITELLM_BASE_URL / LITELLM_MASTER_KEY 未配置，无法生成虚拟 Key。',
        '请在以下任一文件中设置（与运行中的 ClawLive 服务端一致，勿提交密钥）：',
        '  - 仓库根目录 .env',
        '  - apps/server/.env',
        '示例见仓库 .env.example 中 LITELLM_BASE_URL、LITELLM_MASTER_KEY。',
        '若 LiteLLM 只部署在线上，可在 Railway 控制台 Variables 查看同名变量，复制到本机 .env 再执行本脚本。',
      ].join('\n'),
    );
    process.exit(1);
  }

  const usd = parseUsd();
  const user = await resolveUserId();
  const models = appConfig.litellm.models;

  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { litellmVirtualKey: true },
  });

  if (!row?.litellmVirtualKey) {
    const { key } = await generateVirtualKey({
      userId: user.id,
      maxBudgetUsd: usd,
      models,
    });
    await prisma.user.update({
      where: { id: user.id },
      data: { litellmVirtualKey: key },
    });
    console.log(
      JSON.stringify(
        {
          ok: true,
          action: 'created',
          username: user.username,
          userId: user.id,
          maxBudgetUsd: usd,
          virtualKeyMasked: `${key.slice(0, 8)}…`,
        },
        null,
        2,
      ),
    );
  } else {
    await increaseVirtualKeyBudget(row.litellmVirtualKey, usd);
    console.log(
      JSON.stringify(
        {
          ok: true,
          action: 'budget_added',
          username: user.username,
          userId: user.id,
          addUsd: usd,
          virtualKeyMasked: `${row.litellmVirtualKey.slice(0, 8)}…`,
        },
        null,
        2,
      ),
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
