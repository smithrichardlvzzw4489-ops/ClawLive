/**
 * 一次性 / 运维：将指定用户的虾米积分设为指定数值，并写入 PointLedger。
 * 用法：pnpm exec tsx scripts/set-user-claw-points.ts <username> <points>
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';

config({ path: resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

async function main() {
  const username = process.argv[2] ?? 'Darwin1';
  const target = parseInt(process.argv[3] ?? '3000', 10);
  if (!Number.isFinite(target) || target < 0) {
    console.error('Invalid points');
    process.exit(1);
  }

  const u = await prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true, clawPoints: true },
  });
  if (!u) {
    console.error('User not found:', username);
    process.exit(1);
  }

  const delta = target - u.clawPoints;

  await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: u.id },
      data: { clawPoints: target },
      select: { clawPoints: true },
    });
    await tx.pointLedger.create({
      data: {
        userId: u.id,
        delta,
        balanceAfter: updated.clawPoints,
        reason: 'admin_set_balance',
        metadata: { previous: u.clawPoints, target },
      },
    });
  });

  console.log(
    JSON.stringify({ ok: true, username: u.username, before: u.clawPoints, after: target }, null, 2)
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
