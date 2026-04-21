/**
 * GITLINK 全网外联系统：
 * 1. 从 GitHub 提取联系方式（profile email + commit email from Events API）
 * 2. AI 根据用户意图 + 每人画像生成个性化消息
 * 3. 阶梯式批量外联管理（Tier 1/2/3/4）
 * 4. 追踪与回复漏斗
 */

import { getPublishingLlmClient, trackedChatCompletion } from './llm';
import {
  parseQueryToGitHubSearch,
  expandGithubSearchQueries,
  mergeGitHubUserSearchItems,
  type ParsedQuery,
} from './codernet-search';
import type { CodernetAnalysis } from './codernet-profile-analyzer';

const GH_API = 'https://api.github.com';

/* ══════════════════════════════════════════════════════════════
   Types
   ══════════════════════════════════════════════════════════════ */

export interface ContactInfo {
  profileEmail: string | null;
  commitEmail: string | null;
  twitter: string | null;
  blog: string | null;
  bestEmail: string | null;
}

export interface OutreachRecipient {
  githubUsername: string;
  avatarUrl: string;
  name: string | null;
  bio: string | null;
  location: string | null;
  company: string | null;
  followers: number;
  publicRepos: number;
  contact: ContactInfo;
  tier: 1 | 2 | 3 | 4;
  techTags?: string[];
  oneLiner?: string;
  personalizedMessage?: string;
  status: 'pending' | 'message_generated' | 'sent' | 'delivered' | 'opened' | 'replied' | 'failed' | 'no_contact';
}

export type CampaignStatus = 'draft' | 'generating' | 'ready' | 'sending' | 'paused' | 'completed' | 'error';

export interface OutreachCampaign {
  id: string;
  createdAt: number;
  updatedAt: number;
  searchQuery: string;
  githubQuery: string;
  intent: string;
  senderName: string;
  senderInfo: string;
  profileBaseUrl: string;
  status: CampaignStatus;
  totalFound: number;
  recipients: OutreachRecipient[];
  progress: {
    phase: string;
    detail: string;
    contactsExtracted: number;
    messagesGenerated: number;
    messagesSent: number;
    emailableCount: number;
  };
  tierConfig: {
    tier1: number;
    tier2: number;
    tier3: number;
    tier4: number;
  };
}

/* ══════════════════════════════════════════════════════════════
   In-memory campaign store
   ══════════════════════════════════════════════════════════════ */

const campaigns = new Map<string, OutreachCampaign>();

export function getCampaign(id: string): OutreachCampaign | undefined {
  return campaigns.get(id);
}

export function listCampaigns(): OutreachCampaign[] {
  return Array.from(campaigns.values()).sort((a, b) => b.createdAt - a.createdAt);
}

/* ══════════════════════════════════════════════════════════════
   Phase 1: GitHub Search + 分页获取全部候选人
   ══════════════════════════════════════════════════════════════ */

function ghHeaders(token?: string): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'GITLINK/1.0',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

interface GHSearchUserItem {
  login: string;
  id: number;
  avatar_url: string;
  type: string;
  score: number;
}

interface GHSearchResponse {
  total_count: number;
  incomplete_results: boolean;
  items: GHSearchUserItem[];
}

interface GHUserFull {
  login: string;
  name: string | null;
  email: string | null;
  bio: string | null;
  location: string | null;
  company: string | null;
  blog: string | null;
  twitter_username: string | null;
  avatar_url: string;
  followers: number;
  public_repos: number;
  html_url: string;
}

interface GHEventPushPayload {
  commits?: Array<{ author: { email: string; name: string } }>;
}

interface GHEvent {
  type: string;
  payload: GHEventPushPayload;
}

async function fetchAllSearchPages(
  githubQuery: string,
  token: string | undefined,
  maxUsers: number,
  onProgress?: (fetched: number, total: number) => void,
): Promise<GHSearchUserItem[]> {
  const headers = ghHeaders(token);
  const allUsers: GHSearchUserItem[] = [];
  const perPage = 30;
  const maxPages = Math.ceil(Math.min(maxUsers, 1000) / perPage);

  for (let page = 1; page <= maxPages; page++) {
    const params = new URLSearchParams({
      q: githubQuery,
      per_page: String(perPage),
      page: String(page),
    });
    const url = `${GH_API}/search/users?${params}`;
    const res = await fetch(url, { headers });

    if (res.status === 403 || res.status === 422) {
      console.warn(`[Outreach] search rate limited at page ${page}, stopping`);
      break;
    }
    if (!res.ok) break;

    const data = (await res.json()) as GHSearchResponse;
    const users = data.items.filter((u) => u.type === 'User');
    allUsers.push(...users);

    onProgress?.(allUsers.length, Math.min(data.total_count, maxUsers));

    if (allUsers.length >= maxUsers || data.items.length < perPage) break;

    await sleep(2200);
  }

  return allUsers.slice(0, maxUsers);
}

/** 多路 q 分页拉取后合并去重，缓解 GitHub Search Users 单次最多约 1000 条的限制。 */
async function fetchAllSearchPagesMultiShard(
  parsed: ParsedQuery,
  token: string | undefined,
  maxUsers: number,
  onProgress?: (fetched: number, total: number) => void,
): Promise<GHSearchUserItem[]> {
  const queries = expandGithubSearchQueries(parsed);
  const perShardCap = Math.min(1000, Math.max(30, Math.ceil(maxUsers / Math.max(1, queries.length)) + 40));
  const batches: GHSearchUserItem[][] = [];
  let cumulative = 0;

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    const slice = await fetchAllSearchPages(q, token, perShardCap, (fetched, total) => {
      onProgress?.(cumulative + fetched, Math.min(maxUsers, total));
    });
    batches.push(slice);
    cumulative += slice.length;
    if (i < queries.length - 1) await sleep(2200);
  }

  const merged = mergeGitHubUserSearchItems(batches);
  return merged.slice(0, maxUsers);
}

/* ══════════════════════════════════════════════════════════════
   Phase 2: Email 提取 — profile email + commit email
   ══════════════════════════════════════════════════════════════ */

const NOREPLY_PATTERNS = [
  'noreply',
  'users.noreply.github.com',
  'github.com',
];

function isNoReply(email: string): boolean {
  const lower = email.toLowerCase();
  return NOREPLY_PATTERNS.some((p) => lower.includes(p));
}

export async function extractContactInfo(
  username: string,
  token?: string,
): Promise<{ user: GHUserFull; contact: ContactInfo }> {
  const headers = ghHeaders(token);

  const profileRes = await fetch(`${GH_API}/users/${username}`, { headers });
  if (!profileRes.ok) throw new Error(`User API ${profileRes.status}`);
  const user = (await profileRes.json()) as GHUserFull;

  const profileEmail = user.email && !isNoReply(user.email) ? user.email : null;

  let commitEmail: string | null = null;
  try {
    const eventsRes = await fetch(`${GH_API}/users/${username}/events/public?per_page=30`, { headers });
    if (eventsRes.ok) {
      const events = (await eventsRes.json()) as GHEvent[];
      for (const ev of events) {
        if (ev.type === 'PushEvent' && ev.payload.commits) {
          for (const c of ev.payload.commits) {
            if (
              c.author.name?.toLowerCase() === username.toLowerCase() ||
              c.author.name?.toLowerCase() === user.name?.toLowerCase()
            ) {
              if (c.author.email && !isNoReply(c.author.email)) {
                commitEmail = c.author.email;
                break;
              }
            }
          }
          if (commitEmail) break;
        }
      }
    }
  } catch {}

  const bestEmail = profileEmail || commitEmail;

  return {
    user,
    contact: {
      profileEmail,
      commitEmail,
      twitter: user.twitter_username ? `@${user.twitter_username}` : null,
      blog: user.blog || null,
      bestEmail,
    },
  };
}

/* ══════════════════════════════════════════════════════════════
   Phase 3: AI 个性化消息生成
   ══════════════════════════════════════════════════════════════ */

async function generatePersonalizedMessages(
  campaign: OutreachCampaign,
  batchSize: number = 5,
): Promise<void> {
  const eligible = campaign.recipients.filter(
    (r) => r.contact.bestEmail && r.status === 'pending',
  );

  for (let i = 0; i < eligible.length; i += batchSize) {
    const batch = eligible.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map((r) => generateOneMessage(campaign, r)),
    );

    for (let j = 0; j < results.length; j++) {
      if (results[j].status === 'fulfilled') {
        batch[j].personalizedMessage = (results[j] as PromiseFulfilledResult<string>).value;
        batch[j].status = 'message_generated';
      }
    }

    campaign.progress.messagesGenerated = campaign.recipients.filter(
      (r) => r.status === 'message_generated',
    ).length;
    campaign.updatedAt = Date.now();

    if (i + batchSize < eligible.length) await sleep(500);
  }
}

async function generateOneMessage(
  campaign: OutreachCampaign,
  recipient: OutreachRecipient,
): Promise<string> {
  const { client, model } = getPublishingLlmClient();

  const profileUrl = `${campaign.profileBaseUrl}/codernet/github/${recipient.githubUsername}`;

  const recipientInfo = [
    `GitHub: @${recipient.githubUsername}`,
    recipient.name ? `Name: ${recipient.name}` : null,
    recipient.bio ? `Bio: ${recipient.bio}` : null,
    recipient.location ? `Location: ${recipient.location}` : null,
    recipient.company ? `Company: ${recipient.company}` : null,
    `Followers: ${recipient.followers}, Repos: ${recipient.publicRepos}`,
    recipient.techTags?.length ? `Tech: ${recipient.techTags.join(', ')}` : null,
    recipient.oneLiner ? `AI Profile: "${recipient.oneLiner}"` : null,
  ].filter(Boolean).join('\n');

  const prompt = `你是一位专业的开发者关系专家。根据发送者的意图和收件人的信息，生成一封个性化的外联邮件。

发送者：${campaign.senderName}
发送者背景：${campaign.senderInfo}
发送者意图：${campaign.intent}

收件人信息：
${recipientInfo}

收件人的 AI 画像页面：${profileUrl}

要求：
1. 邮件标题（Subject）和正文分开，格式：Subject: xxx\\n\\n正文
2. 开头要体现你了解收件人（提到他具体的项目、技术栈等）
3. 清晰说明来意，不要绕弯子
4. 附上画像链接，用自然的方式："我们的 AI 分析了你的开源贡献，生成了一份技术画像"
5. 结尾简洁，有明确的 call-to-action
6. 整封邮件控制在 150-250 字（中文或英文均可，根据收件人 location 判断）
7. 语气专业但不过于正式，开发者之间的对话感
8. 不要使用 "Dear"、"尊敬的" 等过于正式的称呼`;

  const response = await trackedChatCompletion(
    { model, messages: [{ role: 'user', content: prompt }], max_tokens: 600, temperature: 0.7 },
    'outreach_message',
    { recipient: recipient.githubUsername },
  );

  return response.choices[0]?.message?.content?.trim() || '';
}

/* ══════════════════════════════════════════════════════════════
   Phase 4: 邮件发送（Resend / SMTP）
   ══════════════════════════════════════════════════════════════ */

export type EmailProvider = 'resend' | 'smtp' | 'none';

function getEmailProvider(): EmailProvider {
  if (process.env.RESEND_API_KEY) return 'resend';
  if (process.env.SMTP_HOST) return 'smtp';
  return 'none';
}

async function sendEmail(
  to: string,
  subject: string,
  htmlBody: string,
  fromEmail: string,
  fromName: string,
  opts?: { replyTo?: string | null },
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const provider = getEmailProvider();

  if (provider === 'resend') {
    return sendViaResend(to, subject, htmlBody, fromEmail, fromName, opts);
  }

  if (provider === 'smtp') {
    return sendViaSMTP(to, subject, htmlBody, fromEmail, fromName, opts);
  }

  return { success: false, error: 'No email provider configured. Set RESEND_API_KEY or SMTP_HOST.' };
}

async function sendViaResend(
  to: string,
  subject: string,
  htmlBody: string,
  fromEmail: string,
  fromName: string,
  opts?: { replyTo?: string | null },
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { success: false, error: 'RESEND_API_KEY not set' };

  try {
    const payload: Record<string, unknown> = {
      from: `${fromName} <${fromEmail}>`,
      to: [to],
      subject,
      html: htmlBody,
    };
    const rt = opts?.replyTo?.trim();
    if (rt) payload.reply_to = rt;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) return { success: false, error: data.message || `HTTP ${res.status}` };
    return { success: true, messageId: data.id };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function sendViaSMTP(
  _to: string,
  _subject: string,
  _htmlBody: string,
  _fromEmail: string,
  _fromName: string,
  _opts?: { replyTo?: string | null },
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  return { success: false, error: 'SMTP sending not yet implemented. Use Resend for now.' };
}

function messageToHtml(rawMessage: string, profileUrl: string): string {
  const escaped = rawMessage
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>');

  return `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a2e; line-height: 1.7; padding: 20px;">
  ${escaped}
  <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 24px 0;" />
  <p style="font-size: 12px; color: #888;">
    Sent via <a href="https://gitlink.top" style="color: #7c3aed; text-decoration: none;">GITLINK</a>
    &nbsp;|&nbsp;
    <a href="${profileUrl}" style="color: #7c3aed; text-decoration: none;">View your developer profile</a>
    &nbsp;|&nbsp;
    <a href="https://gitlink.top/unsubscribe" style="color: #888; text-decoration: underline;">Unsubscribe</a>
  </p>
</div>`;
}

function parseSubjectAndBody(raw: string): { subject: string; body: string } {
  const subjectMatch = raw.match(/^Subject:\s*(.+?)(?:\n|\r\n)/i);
  if (subjectMatch) {
    const subject = subjectMatch[1].trim();
    const body = raw.slice(subjectMatch[0].length).trim();
    return { subject, body };
  }
  return { subject: 'Collaboration Opportunity via GITLINK', body: raw };
}

/* ══════════════════════════════════════════════════════════════
   Main Pipeline: createCampaign → runCampaignPipeline
   ══════════════════════════════════════════════════════════════ */

export function createCampaign(params: {
  searchQuery: string;
  githubQuery: string;
  intent: string;
  senderName: string;
  senderInfo: string;
  profileBaseUrl: string;
  tierConfig?: { tier1?: number; tier2?: number; tier3?: number; tier4?: number };
}): OutreachCampaign {
  const id = `orc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const tc = params.tierConfig || {};

  const campaign: OutreachCampaign = {
    id,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    searchQuery: params.searchQuery,
    githubQuery: params.githubQuery,
    intent: params.intent,
    senderName: params.senderName,
    senderInfo: params.senderInfo,
    profileBaseUrl: params.profileBaseUrl || 'https://gitlink.top',
    status: 'draft',
    totalFound: 0,
    recipients: [],
    progress: {
      phase: 'created',
      detail: 'Campaign created',
      contactsExtracted: 0,
      messagesGenerated: 0,
      messagesSent: 0,
      emailableCount: 0,
    },
    tierConfig: {
      tier1: tc.tier1 ?? 10,
      tier2: tc.tier2 ?? 50,
      tier3: tc.tier3 ?? 200,
      tier4: tc.tier4 ?? 1000,
    },
  };

  campaigns.set(id, campaign);
  return campaign;
}

/**
 * Full pipeline: search → extract contacts → assign tiers → generate messages.
 * Messages are NOT sent automatically — user must confirm via sendCampaign().
 */
export async function runCampaignPipeline(
  campaignId: string,
  token?: string,
): Promise<void> {
  const campaign = campaigns.get(campaignId);
  if (!campaign) throw new Error('Campaign not found');

  campaign.status = 'generating';
  campaign.updatedAt = Date.now();

  try {
    /* ── Step 0: LLM 解析自然语言 → GitHub Search 查询 ── */
    campaign.progress.phase = 'searching';
    campaign.progress.detail = 'AI is parsing your search query...';
    campaign.updatedAt = Date.now();

    const parsed = await parseQueryToGitHubSearch(campaign.searchQuery);
    campaign.githubQuery = parsed.githubQuery;
    console.log(`[Outreach] parsed query: "${parsed.githubQuery}" (${parsed.explanation})`);

    /* ── Step 1: 分页获取候选人（多分片合并，突破单次搜索 1000 上限）── */
    const shardCount = expandGithubSearchQueries(parsed).length;
    campaign.progress.detail =
      shardCount > 1
        ? `Searching GitHub (${shardCount} shards, merged pool)...`
        : `Searching GitHub: ${parsed.githubQuery}`;
    campaign.updatedAt = Date.now();

    const maxUsers = campaign.tierConfig.tier4;
    const searchUsers = await fetchAllSearchPagesMultiShard(parsed, token, maxUsers, (fetched, total) => {
      campaign.totalFound = total;
      campaign.progress.detail = `Fetched ${fetched} / ${Math.min(total, maxUsers)} candidates...`;
      campaign.updatedAt = Date.now();
    });

    console.log(`[Outreach] search returned ${searchUsers.length} users`);

    /* ── Step 2: 提取联系方式（阶梯式并发）── */
    campaign.progress.phase = 'extracting_contacts';
    campaign.progress.detail = `Extracting contact info for ${searchUsers.length} developers...`;

    const recipients: OutreachRecipient[] = [];
    const batchSize = 5;

    for (let i = 0; i < searchUsers.length; i += batchSize) {
      const batch = searchUsers.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map((u) => extractContactInfo(u.login, token)),
      );

      for (let j = 0; j < results.length; j++) {
        const idx = i + j;
        const tier = assignTier(idx, campaign.tierConfig);

        if (results[j].status === 'fulfilled') {
          const { user, contact } = (results[j] as PromiseFulfilledResult<{ user: GHUserFull; contact: ContactInfo }>).value;
          recipients.push({
            githubUsername: user.login,
            avatarUrl: user.avatar_url,
            name: user.name,
            bio: user.bio,
            location: user.location,
            company: user.company,
            followers: user.followers,
            publicRepos: user.public_repos,
            contact,
            tier,
            status: contact.bestEmail ? 'pending' : 'no_contact',
          });
        } else {
          recipients.push({
            githubUsername: batch[j].login,
            avatarUrl: batch[j].avatar_url,
            name: null,
            bio: null,
            location: null,
            company: null,
            followers: 0,
            publicRepos: 0,
            contact: { profileEmail: null, commitEmail: null, twitter: null, blog: null, bestEmail: null },
            tier,
            status: 'no_contact',
          });
        }
      }

      campaign.recipients = recipients;
      campaign.progress.contactsExtracted = recipients.length;
      campaign.progress.emailableCount = recipients.filter((r) => r.contact.bestEmail).length;
      campaign.progress.detail = `Extracted ${recipients.length}/${searchUsers.length} contacts (${campaign.progress.emailableCount} with email)`;
      campaign.updatedAt = Date.now();

      if (i + batchSize < searchUsers.length) await sleep(1200);
    }

    /* ── Step 3: AI 生成个性化消息（仅有 email 的人）── */
    campaign.progress.phase = 'generating_messages';
    campaign.progress.detail = 'AI is generating personalized messages...';

    await generatePersonalizedMessages(campaign, 3);

    campaign.status = 'ready';
    campaign.progress.phase = 'ready';
    campaign.progress.detail = `Ready to send: ${campaign.progress.messagesGenerated} personalized messages`;
    campaign.updatedAt = Date.now();

    console.log(
      `[Outreach] campaign ${campaignId}: ${recipients.length} recipients, ${campaign.progress.emailableCount} emailable, ${campaign.progress.messagesGenerated} messages generated`,
    );
  } catch (err) {
    campaign.status = 'error';
    campaign.progress.phase = 'error';
    campaign.progress.detail = err instanceof Error ? err.message : String(err);
    campaign.updatedAt = Date.now();
    throw err;
  }
}

/**
 * Send all generated messages. Rate-limited: sends in batches with delays.
 */
export async function sendCampaign(
  campaignId: string,
  fromEmail: string,
): Promise<void> {
  const campaign = campaigns.get(campaignId);
  if (!campaign) throw new Error('Campaign not found');
  if (campaign.status !== 'ready' && campaign.status !== 'paused') {
    throw new Error(`Cannot send: campaign status is ${campaign.status}`);
  }

  const provider = getEmailProvider();
  if (provider === 'none') {
    throw new Error('No email provider configured. Set RESEND_API_KEY or SMTP_HOST in environment.');
  }

  campaign.status = 'sending';
  campaign.progress.phase = 'sending';
  campaign.updatedAt = Date.now();

  const toSend = campaign.recipients.filter((r) => r.status === 'message_generated' && r.contact.bestEmail);
  let sent = 0;

  for (const recipient of toSend) {
    if ((campaign.status as CampaignStatus) === 'paused') break;

    const { subject, body } = parseSubjectAndBody(recipient.personalizedMessage || '');
    const profileUrl = `${campaign.profileBaseUrl}/codernet/github/${recipient.githubUsername}`;
    const html = messageToHtml(body, profileUrl);

    const result = await sendEmail(recipient.contact.bestEmail!, subject, html, fromEmail, campaign.senderName);

    if (result.success) {
      recipient.status = 'sent';
      sent++;
    } else {
      recipient.status = 'failed';
      console.warn(`[Outreach] send failed to ${recipient.githubUsername}: ${result.error}`);
    }

    campaign.progress.messagesSent = sent;
    campaign.progress.detail = `Sent ${sent}/${toSend.length} emails...`;
    campaign.updatedAt = Date.now();

    await sleep(3000);
  }

  if ((campaign.status as CampaignStatus) !== 'paused') {
    campaign.status = 'completed';
    campaign.progress.phase = 'completed';
    campaign.progress.detail = `Done: ${sent} emails sent`;
  }
  campaign.updatedAt = Date.now();
}

export function pauseCampaign(campaignId: string): void {
  const c = campaigns.get(campaignId);
  if (c && c.status === 'sending') {
    c.status = 'paused';
    c.updatedAt = Date.now();
  }
}

/* ══════════════════════════════════════════════════════════════
   Preview: 为单个收件人生成预览消息（不需要创建 campaign）
   ══════════════════════════════════════════════════════════════ */

export async function previewMessage(params: {
  intent: string;
  senderName: string;
  senderInfo: string;
  recipientUsername: string;
  recipientProfile?: {
    name?: string;
    bio?: string;
    location?: string;
    company?: string;
    followers?: number;
    publicRepos?: number;
    techTags?: string[];
    oneLiner?: string;
  };
}): Promise<string> {
  const mockCampaign: OutreachCampaign = {
    id: 'preview',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    searchQuery: '',
    githubQuery: '',
    intent: params.intent,
    senderName: params.senderName,
    senderInfo: params.senderInfo,
    profileBaseUrl: 'https://gitlink.top',
    status: 'draft',
    totalFound: 0,
    recipients: [],
    progress: { phase: '', detail: '', contactsExtracted: 0, messagesGenerated: 0, messagesSent: 0, emailableCount: 0 },
    tierConfig: { tier1: 10, tier2: 50, tier3: 200, tier4: 1000 },
  };

  const recipient: OutreachRecipient = {
    githubUsername: params.recipientUsername,
    avatarUrl: `https://github.com/${params.recipientUsername}.png`,
    name: params.recipientProfile?.name || null,
    bio: params.recipientProfile?.bio || null,
    location: params.recipientProfile?.location || null,
    company: params.recipientProfile?.company || null,
    followers: params.recipientProfile?.followers || 0,
    publicRepos: params.recipientProfile?.publicRepos || 0,
    contact: { profileEmail: null, commitEmail: null, twitter: null, blog: null, bestEmail: null },
    tier: 1,
    techTags: params.recipientProfile?.techTags,
    oneLiner: params.recipientProfile?.oneLiner,
    status: 'pending',
  };

  return generateOneMessage(mockCampaign, recipient);
}

/* ══════════════════════════════════════════════════════════════
   Helpers
   ══════════════════════════════════════════════════════════════ */

function assignTier(index: number, config: OutreachCampaign['tierConfig']): 1 | 2 | 3 | 4 {
  if (index < config.tier1) return 1;
  if (index < config.tier2) return 2;
  if (index < config.tier3) return 3;
  return 4;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 供 LINK 联系等场景复用：HTML 邮件正文 + 发送（Resend/SMTP） */
export async function sendOutreachHtmlToDeveloper(
  to: string,
  subject: string,
  plainBody: string,
  profileUrl: string,
  fromEmail: string,
  fromName: string,
  opts?: { replyTo?: string | null },
): Promise<{ success: boolean; error?: string; messageId?: string }> {
  const html = messageToHtml(plainBody, profileUrl);
  return sendEmail(to, subject, html, fromEmail, fromName, opts);
}
