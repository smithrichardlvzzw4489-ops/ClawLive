import { prisma } from '../lib/prisma';

/**
 * 部署时设置 ADMIN_BOOTSTRAP_USERNAMES=alice,bob 可在启动后将对应 username 标为管理员（幂等）。
 */
export async function syncAdminBootstrapFromEnv(): Promise<void> {
  const raw = process.env.ADMIN_BOOTSTRAP_USERNAMES?.trim();
  if (!raw) return;
  const names = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (names.length === 0) return;
  const result = await prisma.user.updateMany({
    where: { username: { in: names } },
    data: { isAdmin: true },
  });
  if (result.count > 0) {
    console.log(`[Admin] ADMIN_BOOTSTRAP_USERNAMES: marked ${result.count} user(s) as admin`);
  }
}
