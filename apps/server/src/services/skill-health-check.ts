/**
 * Skill AI 健康检测服务
 * 借鉴傅盛提出的 8 类高危 Skill，对 markdown 内容进行规则检测
 */
export type RiskLevel = 'safe' | 'low' | 'medium' | 'high';

export interface DetectionRule {
  id: string;
  name: string;
  riskLevel: RiskLevel;
  pattern: RegExp | string;
  description: string;
}

/** 检测规则：借鉴傅盛 8 类高危 + markdown 场景 */
const RULES: DetectionRule[] = [
  // 1. 密钥收割型 - 诱导用户输入/提供 API Key
  {
    id: 'key-harvest',
    name: 'key-harvest',
    riskLevel: 'high',
    pattern: /(?:输入|提供|填写|配置)\s*(?:你的?|用户)?\s*(?:API\s*[Kk]ey|密钥|token|Token|私钥|password|密码)/i,
    description: '诱导输入 API Key 或密钥',
  },
  {
    id: 'key-harvest-env',
    name: 'key-harvest-env',
    riskLevel: 'high',
    pattern: /OPENAI_API_KEY|API_KEY|SECRET_KEY|\.env\s*(?:文件)?\s*中的?\s*(?:key|密钥)/i,
    description: '读取环境变量或 .env 中的密钥',
  },
  // 2. 数据外泄型 - 让 Agent 发送数据到外部
  {
    id: 'data-exfil',
    name: 'data-exfil',
    riskLevel: 'high',
    pattern: /(?:发送|post|POST|上传)\s*(?:到|to)\s*(?:http|https|http[s]?:\/\/)/i,
    description: '将数据发送到外部 URL',
  },
  {
    id: 'data-exfil-fetch',
    name: 'data-exfil-fetch',
    riskLevel: 'high',
    pattern: /(?:fetch|axios|request)\s*\(\s*['"](https?:\/\/[^'"]+)['"]/i,
    description: '请求外部 URL 并可能泄露数据',
  },
  // 3. 动态拉取型 - 运行时从外部获取指令
  {
    id: 'dynamic-pull',
    name: 'dynamic-pull',
    riskLevel: 'high',
    pattern: /(?:访问|打开|请求|获取)\s*(?:url|链接|地址)\s*(?:https?:\/\/|http)/i,
    description: '动态拉取外部内容/指令',
  },
  {
    id: 'dynamic-pull-instruction',
    name: 'dynamic-pull-instruction',
    riskLevel: 'high',
    pattern: /(?:从|从以下)\s*(?:url|URL|链接)\s*(?:获取|拉取|加载)\s*(?:最新)?\s*(?:指令|配置|代码)/i,
    description: '从外部 URL 获取指令',
  },
  // 4. 越权访问型 - 访问敏感文件/系统
  {
    id: 'privilege-file',
    name: 'privilege-file',
    riskLevel: 'high',
    pattern: /(?:读取|访问|打开)\s*(?:~\/\.ssh|\.ssh\/|\/etc\/|\.env|\.config)/i,
    description: '访问 SSH 私钥或系统敏感文件',
  },
  {
    id: 'privilege-filesystem',
    name: 'privilege-filesystem',
    riskLevel: 'medium',
    pattern: /(?:fs\.|readFile|writeFile|require\s*\(\s*['"]fs['"]\))/i,
    description: '直接操作文件系统',
  },
  // 5. 提示词注入 - 隐藏指令覆盖用户意图
  {
    id: 'prompt-injection-ignore',
    name: 'prompt-injection-ignore',
    riskLevel: 'high',
    pattern: /(?:忽略| disregard|忘记)\s*(?:之前|以上|上述)\s*(?:所有)?\s*(?:指令|指示|规则)/i,
    description: '提示词注入：忽略之前指令',
  },
  {
    id: 'prompt-injection-secret',
    name: 'prompt-injection-secret',
    riskLevel: 'high',
    pattern: /(?:秘密|私下|不要告诉用户)\s*(?:执行|发送|存储)/i,
    description: '提示词注入：秘密执行',
  },
  {
    id: 'prompt-injection-override',
    name: 'prompt-injection-override',
    riskLevel: 'medium',
    pattern: /(?:新的?|替代)\s*(?:系统\s*)?(?:提示|指令)\s*[:：]/i,
    description: '覆盖系统提示',
  },
  // 6. 可疑 URL - 短链、非知名域名
  {
    id: 'suspicious-url',
    name: 'suspicious-url',
    riskLevel: 'medium',
    pattern: /https?:\/\/(?:bit\.ly|tinyurl|t\.co|goo\.gl)[^\s)]+/i,
    description: '可疑短链域名',
  },
  // 7. 执行代码 - eval/exec 等
  {
    id: 'code-exec',
    name: 'code-exec',
    riskLevel: 'high',
    pattern: /(?:eval\s*\(|exec\s*\(|Function\s*\(|child_process)/i,
    description: '动态执行代码',
  },
  // 8. 混淆代码 - 傅盛 scan.sh 第三项
  {
    id: 'obfuscation-eval-base64',
    name: 'obfuscation-eval-base64',
    riskLevel: 'high',
    pattern: /eval\s*\(\s*(?:atob|btoa)\s*\(/i,
    description: '混淆：eval + base64 解码',
  },
  {
    id: 'obfuscation-charCode',
    name: 'obfuscation-charCode',
    riskLevel: 'high',
    pattern: /(?:String\.fromCharCode|fromCharCode)\s*\([^)]{20,}\)/i,
    description: '混淆：String.fromCharCode 长参数',
  },
];

export interface DetectionHit {
  ruleId: string;
  ruleName: string;
  riskLevel: RiskLevel;
  description: string;
  snippet: string;
  startIndex: number;
}

export interface HealthCheckResult {
  riskLevel: RiskLevel;
  score: number; // 0-100, 100=safe
  hits: DetectionHit[];
  summary: string;
  checkedAt: string;
}

function getHighestRiskLevel(levels: RiskLevel[]): RiskLevel {
  const order: RiskLevel[] = ['high', 'medium', 'low', 'safe'];
  for (const r of order) {
    if (levels.includes(r)) return r;
  }
  return 'safe';
}

function calculateScore(hits: DetectionHit[]): number {
  if (hits.length === 0) return 100;
  const weights: Record<RiskLevel, number> = { high: -25, medium: -15, low: -5, safe: 0 };
  let score = 100;
  for (const h of hits) {
    score += weights[h.riskLevel] ?? 0;
  }
  return Math.max(0, Math.min(100, score));
}

function extractSnippet(content: string, index: number, length = 60): string {
  const start = Math.max(0, index - 20);
  const end = Math.min(content.length, index + length);
  let snippet = content.slice(start, end);
  if (start > 0) snippet = '…' + snippet;
  if (end < content.length) snippet = snippet + '…';
  return snippet.replace(/\n/g, ' ');
}

/**
 * 对 skill markdown 内容进行健康检测
 */
export function checkSkillHealth(content: string): HealthCheckResult {
  const hits: DetectionHit[] = [];
  const normalizedContent = content || '';

  for (const rule of RULES) {
    const pattern = typeof rule.pattern === 'string' ? new RegExp(rule.pattern, 'gi') : rule.pattern;
    const matches = normalizedContent.matchAll(pattern);
    for (const m of matches) {
      const matchStr = m[0];
      const idx = m.index ?? 0;
      hits.push({
        ruleId: rule.id,
        ruleName: rule.name,
        riskLevel: rule.riskLevel,
        description: rule.description,
        snippet: extractSnippet(normalizedContent, idx, matchStr.length + 40),
        startIndex: idx,
      });
    }
  }

  const riskLevel = getHighestRiskLevel(hits.map((h) => h.riskLevel));
  const score = calculateScore(hits);

  const summaries: Record<RiskLevel, string> = {
    safe: '未检测到明显风险',
    low: '存在低风险项，建议人工复核',
    medium: '存在中风险项，使用前请谨慎',
    high: '存在高风险项，建议不要使用',
  };

  return {
    riskLevel,
    score,
    hits,
    summary: hits.length > 0 ? summaries[riskLevel] : summaries.safe,
    checkedAt: new Date().toISOString(),
  };
}
