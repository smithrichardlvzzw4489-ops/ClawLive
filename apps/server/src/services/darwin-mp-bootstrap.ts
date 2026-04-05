import { defaultDarwinDisplayName } from '../lib/darwin-defaults';
import { applyLobster, getLobsterInstance } from './lobster-persistence';

/**
 * 微信小程序登录后：无 Lobster 实例则自动创建（默认名、无问卷），并触发与网页首次申请一致的进化 bootstrap。
 */
export async function ensureWeChatDarwinForUser(userId: string): Promise<void> {
  if (getLobsterInstance(userId)) return;
  const name = defaultDarwinDisplayName();
  await applyLobster(userId, name);
  const { onDarwinClawFirstApply } = await import('./evolution-network-service');
  void onDarwinClawFirstApply(userId).catch((e) =>
    console.error('[Evolution] wechat darwin bootstrap:', e),
  );
  console.log(`[mp] Auto Darwin for user ${userId} (name="${name}")`);
}
