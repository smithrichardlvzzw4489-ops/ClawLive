import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const CREDITS_FILE = path.join(DATA_DIR, "credits.json");

type CreditsFile = {
  accounts: Record<string, number>;
};

let writeChain: Promise<void> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeChain.then(() => fn());
  writeChain = next.then(() => {}).catch(() => {});
  return next;
}

function initialBalance(): number {
  const n = Number(process.env.CREDITS_INITIAL);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 200;
}

export function creditsCostCreate(): number {
  const n = Number(process.env.CREDITS_COST_CREATE);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 10;
}

export function creditsCostRefine(): number {
  const n = Number(process.env.CREDITS_COST_REFINE);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 6;
}

/** 与客户端校验一致：8～64 位安全字符 */
export function isValidClientId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{8,64}$/.test(id);
}

async function readFile(): Promise<CreditsFile> {
  try {
    const raw = await fs.readFile(CREDITS_FILE, "utf-8");
    const p = JSON.parse(raw) as unknown;
    if (
      typeof p === "object" &&
      p !== null &&
      "accounts" in p &&
      typeof (p as CreditsFile).accounts === "object" &&
      (p as CreditsFile).accounts !== null
    ) {
      return { accounts: { ...(p as CreditsFile).accounts } };
    }
  } catch {
    /* */
  }
  return { accounts: {} };
}

async function writeFile(data: CreditsFile): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(CREDITS_FILE, JSON.stringify(data, null, 2), "utf-8");
}

export async function getCreditsBalance(clientId: string): Promise<number> {
  if (!isValidClientId(clientId)) return 0;
  const data = await readFile();
  const v = data.accounts[clientId];
  if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.floor(v));
  return initialBalance();
}

/** 首次读取时写入默认额度（惰性开户） */
async function ensureBalance(clientId: string, data: CreditsFile): Promise<number> {
  const cur = data.accounts[clientId];
  if (typeof cur === "number" && Number.isFinite(cur) && cur >= 0) {
    return Math.floor(cur);
  }
  const start = initialBalance();
  data.accounts[clientId] = start;
  return start;
}

export type DebitResult =
  | { ok: true; balance: number }
  | { ok: false; balance: number };

/**
 * 成功调用 AI 前扣费；若余额不足则不改动。
 */
export async function debitCredits(
  clientId: string,
  amount: number,
): Promise<DebitResult> {
  if (!isValidClientId(clientId) || amount <= 0) {
    return { ok: false, balance: 0 };
  }
  return enqueue(async () => {
    const data = await readFile();
    let bal = await ensureBalance(clientId, data);
    if (bal < amount) {
      return { ok: false, balance: bal } as const;
    }
    bal -= amount;
    data.accounts[clientId] = bal;
    await writeFile(data);
    return { ok: true, balance: bal } as const;
  });
}

/**
 * AI 调用失败或改为演示回退时退回额度。
 */
export async function creditCredits(
  clientId: string,
  amount: number,
): Promise<{ balance: number }> {
  if (!isValidClientId(clientId) || amount <= 0) {
    return { balance: 0 };
  }
  return enqueue(async () => {
    const data = await readFile();
    let bal = await ensureBalance(clientId, data);
    bal += amount;
    data.accounts[clientId] = bal;
    await writeFile(data);
    return { balance: bal };
  });
}

export function getCreditsPublicConfig(): {
  initial: number;
  costCreate: number;
  costRefine: number;
} {
  return {
    initial: initialBalance(),
    costCreate: creditsCostCreate(),
    costRefine: creditsCostRefine(),
  };
}
