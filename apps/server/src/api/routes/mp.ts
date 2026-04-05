import { Router, Request, Response } from 'express';
import type { IRouter } from 'express';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import { prisma } from '../../lib/prisma';
import { config } from '../../config';
import { ensureWeChatDarwinForUser } from '../../services/darwin-mp-bootstrap';

const router: IRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

function mpCreds(): { appId: string; secret: string } | null {
  const appId =
    process.env.WECHAT_MP_APPID?.trim() || process.env.WX_MP_APPID?.trim();
  const secret =
    process.env.WECHAT_MP_SECRET?.trim() || process.env.WX_MP_SECRET?.trim();
  if (!appId || !secret) return null;
  return { appId, secret };
}

type JsCode2SessionOk = {
  openid: string;
  session_key: string;
  unionid?: string;
};

type JsCode2SessionErr = {
  errcode: number;
  errmsg: string;
};

/**
 * POST /api/mp/login
 * Body: { code: string } — 小程序 wx.login 返回的临时 code
 * 成功: { token, user: { id, username } }
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const creds = mpCreds();
    if (!creds) {
      return res.status(503).json({
        error: 'mp_not_configured',
        message:
          '服务端未配置 WECHAT_MP_APPID / WECHAT_MP_SECRET（或 WX_MP_APPID / WX_MP_SECRET）',
      });
    }

    const code =
      typeof req.body?.code === 'string' ? req.body.code.trim() : '';
    if (!code) {
      return res.status(400).json({ error: 'code_required' });
    }

    const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
    url.searchParams.set('appid', creds.appId);
    url.searchParams.set('secret', creds.secret);
    url.searchParams.set('js_code', code);
    url.searchParams.set('grant_type', 'authorization_code');

    const wxRes = await fetch(url.toString(), {
      method: 'GET',
      signal: AbortSignal.timeout(15_000),
    });
    const wxJson = (await wxRes.json()) as JsCode2SessionOk | JsCode2SessionErr;

    if ('errcode' in wxJson && wxJson.errcode !== 0) {
      console.warn('[mp/login] wechat error:', wxJson.errcode, wxJson.errmsg);
      return res.status(401).json({
        error: 'wechat_reject',
        message: wxJson.errmsg || 'code 无效或已过期，请重试',
      });
    }

    const ok = wxJson as JsCode2SessionOk;
    if (!ok.openid) {
      return res.status(502).json({ error: 'wechat_bad_response' });
    }

    let user = await prisma.user.findUnique({
      where: { wechatMpOpenid: ok.openid },
    });

    const minRedeem = config.points.minRedeem;

    if (!user) {
      const suffix = randomBytes(8).toString('hex');
      const username = `wxmp_${suffix}`;
      user = await prisma.user.create({
        data: {
          username,
          wechatMpOpenid: ok.openid,
          passwordHash: null,
          /** 默认给到「一次最低兑换」额度，便于在 VibeKids「我的」里兑换虚拟 Key */
          clawPoints: minRedeem,
        },
      });
    }

    await ensureWeChatDarwinForUser(user.id);

    /** 尚无虚拟 Key 且积分低于最低兑换线时，登录补足到 minRedeem（便于首次兑换） */
    const bal = await prisma.user.findUnique({
      where: { id: user.id },
      select: { clawPoints: true, litellmVirtualKey: true },
    });
    if (
      bal &&
      !bal.litellmVirtualKey &&
      bal.clawPoints < minRedeem
    ) {
      const prev = bal.clawPoints;
      const delta = minRedeem - prev;
      await prisma.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id: user.id },
          data: { clawPoints: minRedeem },
          select: { clawPoints: true },
        });
        await tx.pointLedger.create({
          data: {
            userId: user.id,
            delta,
            balanceAfter: updated.clawPoints,
            reason: 'mp_login_starter_credits',
            metadata: { previous: prev, target: minRedeem },
          },
        });
      });
    }

    const token = jwt.sign(
      { userId: user.id },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions,
    );

    return res.json({
      token,
      user: { id: user.id, username: user.username },
    });
  } catch (e) {
    console.error('[mp/login]', e);
    return res.status(500).json({ error: 'mp_login_failed' });
  }
});

export const mpRoutes: IRouter = router;
