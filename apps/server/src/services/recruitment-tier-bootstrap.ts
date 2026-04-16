import { prisma } from '../lib/prisma';
import { setUserTier } from './quota-manager';

/**
 * 内置名单：保证指定站内 username 拥有 Pro 档（含「招聘推荐」月度额度）。
 * 可与环境变量 RECRUITMENT_BOOTSTRAP_PRO_USERNAMES（逗号分隔）叠加；服务启动时幂等执行。
 */
const DEFAULT_RECRUITMENT_PRO_USERNAMES = ['smithrichardlvzzw4489-ops'] as const;

export async function syncRecruitmentProTierBootstrapFromEnv(): Promise<void> {
  const raw = process.env.RECRUITMENT_BOOTSTRAP_PRO_USERNAMES?.trim();
  const fromEnv = raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : [];
  const names = [...new Set([...DEFAULT_RECRUITMENT_PRO_USERNAMES, ...fromEnv])];
  let applied = 0;
  const notFound: string[] = [];

  for (const username of names) {
    const row = await prisma.user.findUnique({ where: { username }, select: { id: true } });
    if (!row) {
      notFound.push(username);
      continue;
    }
    setUserTier(row.id, 'pro');
    applied += 1;
  }

  if (applied > 0) {
    console.log(`[Recruitment] pro tier bootstrap: set ${applied} user(s) to tier pro`);
  }
  if (notFound.length > 0) {
    console.log(
      `[Recruitment] pro tier bootstrap: no User row yet for: ${notFound.join(', ')} (assign after first signup, then restart)`,
    );
  }
}
