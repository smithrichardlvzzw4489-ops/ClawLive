/**
 * 一条命令发 Key：为「最近活跃」的微信小程序用户创建 LiteLLM 虚拟 Key（或追加预算）。
 * 仅使用进程环境变量（Railway / 容器注入），不要求生成本地 .env。
 *
 * 在 apps/server 目录下执行（需已安装依赖、且 DATABASE_URL / LITELLM_* 已由平台注入）：
 *
 *   pnpm run ops:grant-latest-wechat-key
 *
 * 本地已 `railway link` 时，用线上变量跑同一条命令（推荐）：
 *
 *   railway run pnpm run ops:grant-latest-wechat-key
 */
import { prisma } from '../src/lib/prisma';
import { config } from '../src/config';
import {
  generateVirtualKey,
  increaseVirtualKeyBudget,
  isLitellmConfigured,
} from '../src/services/litellm-budget';

async function main() {
  if (!isLitellmConfigured()) {
    console.error('[ops] 缺少 LITELLM_BASE_URL 或 LITELLM_MASTER_KEY');
    process.exit(1);
  }

  const fromEnv = Number(process.env.GRANT_LLM_USD);
  const usd =
    Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 2;

  const user = await prisma.user.findFirst({
    where: { wechatMpOpenid: { not: null } },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, username: true, litellmVirtualKey: true },
  });

  if (!user) {
    console.error('[ops] NO_WECHAT_MP_USER');
    process.exit(1);
  }

  const models = config.litellm.models;

  if (!user.litellmVirtualKey) {
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
    await increaseVirtualKeyBudget(user.litellmVirtualKey, usd);
    console.log(
      JSON.stringify(
        {
          ok: true,
          action: 'budget_added',
          username: user.username,
          userId: user.id,
          addUsd: usd,
        },
        null,
        2,
      ),
    );
  }
}

main()
  .catch((e) => {
    console.error('[ops]', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
