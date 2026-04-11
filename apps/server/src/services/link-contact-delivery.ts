import { prisma } from '../lib/prisma';

/**
 * 用户绑定 GitHub 登录名后，将此前 LINK 联系产生的待投递记录转为站内信并删除待办。
 */
export async function deliverLinkContactPendingForUser(
  recipientUserId: string,
  githubLoginRaw: string,
): Promise<{ delivered: number }> {
  const gh = githubLoginRaw.trim().toLowerCase();
  if (!gh) return { delivered: 0 };

  const pendings = await prisma.linkContactPending.findMany({
    where: { targetGithubUsername: { equals: gh, mode: 'insensitive' } },
  });

  let delivered = 0;
  for (const p of pendings) {
    if (p.senderId === recipientUserId) {
      await prisma.linkContactPending.delete({ where: { id: p.id } });
      continue;
    }
    await prisma.siteMessage.create({
      data: {
        senderId: p.senderId,
        recipientId: recipientUserId,
        subject: p.subject,
        body: p.body,
        source: 'link',
      },
    });
    await prisma.linkContactPending.delete({ where: { id: p.id } });
    delivered++;
  }

  return { delivered };
}
