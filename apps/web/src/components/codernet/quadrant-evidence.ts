export type QuadrantKey = 'frontend' | 'backend' | 'infra' | 'ai_ml';

export type EvidenceRepoRow = {
  name: string;
  language: string | null;
  description: string | null;
  topics?: string[];
  stars?: number;
  url?: string;
};

export type QuadrantEvidenceContext = {
  languageDistribution?: Array<{ language: string; percent: number }>;
  techTags?: string[];
  repos?: EvidenceRepoRow[];
  recentCommits?: Array<{ repo: string; message: string; date: string }>;
  hfTopPipelineTags?: string[];
  stackOverflowTopTags?: string[];
};

const KW: Record<QuadrantKey, readonly string[]> = {
  frontend: [
    'react',
    'vue',
    'svelte',
    'angular',
    'next',
    'nuxt',
    'webpack',
    'vite',
    'rollup',
    'tailwind',
    'emotion',
    'styled',
    'css',
    'scss',
    'sass',
    'less',
    'html',
    'frontend',
    'spa',
    'ui',
    'ux',
    'component',
    'storybook',
    'electron',
    'react-native',
    'expo',
    'flutter',
    'swiftui',
  ],
  backend: [
    'api',
    'rest',
    'graphql',
    'grpc',
    'microservice',
    'server',
    'backend',
    'django',
    'flask',
    'fastapi',
    'express',
    'nestjs',
    'spring',
    'rails',
    'laravel',
    'kafka',
    'rabbitmq',
    'postgres',
    'postgresql',
    'mysql',
    'mongodb',
    'redis',
    'sqlite',
    'orm',
    'prisma',
    'sequelize',
    'oauth',
    'jwt',
    'authentication',
  ],
  infra: [
    'docker',
    'kubernetes',
    'k8s',
    'helm',
    'terraform',
    'ansible',
    'pulumi',
    'ci/cd',
    'github actions',
    'gitlab ci',
    'jenkins',
    'argocd',
    'istio',
    'nginx',
    'caddy',
    'traefik',
    'prometheus',
    'grafana',
    'loki',
    'elk',
    'datadog',
    'observability',
    'devops',
    'sre',
    'infra',
    'deployment',
    'cloudformation',
    'cdk',
  ],
  ai_ml: [
    'pytorch',
    'tensorflow',
    'keras',
    'jax',
    'onnx',
    'huggingface',
    'transformers',
    'llm',
    'gpt',
    'langchain',
    'vector',
    'embedding',
    'fine-tun',
    'fine tun',
    'lora',
    'rlhf',
    'diffusion',
    'stable diffusion',
    'computer vision',
    'nlp',
    'machine learning',
    'deep learning',
    'neural',
    'dataset',
    'notebook',
    'colab',
    'sklearn',
    'scikit',
    'cuda',
    'wandb',
    'mlflow',
  ],
};

const LANG_DIM: Record<QuadrantKey, ReadonlySet<string>> = {
  frontend: new Set([
    'HTML',
    'CSS',
    'JavaScript',
    'TypeScript',
    'Vue',
    'Svelte',
    'Dart',
    'Swift',
    'Kotlin',
    'SCSS',
    'Less',
    'JSX',
    'TSX',
  ]),
  backend: new Set([
    'Go',
    'Java',
    'Kotlin',
    'Python',
    'Ruby',
    'PHP',
    'C#',
    'Scala',
    'Elixir',
    'Erlang',
    'C',
    'C++',
    'Rust',
    'Haskell',
    'Clojure',
    'Perl',
    'Lua',
    'Groovy',
    'Objective-C',
    'Visual Basic',
    'Jupyter Notebook',
  ]),
  infra: new Set(['Shell', 'Dockerfile', 'HCL', 'Makefile', 'PowerShell', 'Nix']),
  ai_ml: new Set(['Jupyter Notebook', 'R', 'Julia']),
};

function norm(s: string): string {
  return s.toLowerCase();
}

function repoHaystack(r: EvidenceRepoRow): string {
  return norm(
    [r.name, r.language || '', r.description || '', ...(r.topics || [])].filter(Boolean).join(' '),
  );
}

function commitMatchesDim(dim: QuadrantKey, message: string): boolean {
  const m = norm(message);
  return KW[dim].some((k) => m.includes(k));
}

function repoMatchScore(dim: QuadrantKey, r: EvidenceRepoRow): number {
  const h = repoHaystack(r);
  let s = 0;
  for (const k of KW[dim]) {
    if (h.includes(k)) s += k.length > 4 ? 3 : 2;
  }
  if (r.language && LANG_DIM[dim].has(r.language)) s += 4;
  return s;
}

function scoreBand(score: number): string {
  if (score >= 75) return '偏高：公开信号里该方向特征较集中。';
  if (score >= 45) return '中等：有一定相关仓库或语言占比。';
  if (score >= 20) return '偏低：有零星相关信号。';
  return '很低：当前抓取样本中该方向信号较弱（也可能是 LLM 保守估计）。';
}

export function buildQuadrantEvidenceReport(
  dim: QuadrantKey,
  score: number,
  ctx?: QuadrantEvidenceContext | null,
): {
  band: string;
  languageLines: string[];
  repoRows: Array<{ name: string; url?: string; stars: number; score: number; snippet: string }>;
  commitRows: Array<{ repo: string; date: string; message: string }>;
  platformLines: string[];
} {
  const band = scoreBand(score);
  const languageLines: string[] = [];
  const repoRows: Array<{ name: string; url?: string; stars: number; score: number; snippet: string }> = [];
  const commitRows: Array<{ repo: string; date: string; message: string }> = [];
  const platformLines: string[] = [];

  if (!ctx) {
    return { band, languageLines, repoRows, commitRows, platformLines };
  }

  for (const { language, percent } of ctx.languageDistribution || []) {
    if (LANG_DIM[dim].has(language)) {
      languageLines.push(`${language} 约 ${percent}%`);
    }
  }
  if (dim === 'ai_ml' || dim === 'backend') {
    const py = ctx.languageDistribution?.find((l) => l.language === 'Python');
    if (py && py.percent >= 8) {
      languageLines.push(`Python 约 ${py.percent}%（常见于后端与 AI，需结合仓库主题判断）`);
    }
  }

  const repos = [...(ctx.repos || [])];
  repos.sort((a, b) => repoMatchScore(dim, b) - repoMatchScore(dim, a) || (b.stars || 0) - (a.stars || 0));
  for (const r of repos) {
    const sc = repoMatchScore(dim, r);
    if (sc < 2) continue;
    const desc = (r.description || '').slice(0, 120);
    const snip = [r.language && `lang:${r.language}`, desc, (r.topics || []).slice(0, 4).join(', ')].filter(Boolean).join(' · ');
    repoRows.push({
      name: r.name,
      url: r.url,
      stars: r.stars ?? 0,
      score: sc,
      snippet: snip || r.name,
    });
    if (repoRows.length >= 14) break;
  }

  const commits = [...(ctx.recentCommits || [])].sort((a, b) => b.date.localeCompare(a.date));
  for (const c of commits) {
    if (!commitMatchesDim(dim, c.message)) continue;
    commitRows.push({ repo: c.repo, date: c.date.slice(0, 10), message: c.message.slice(0, 200) });
    if (commitRows.length >= 45) break;
  }

  if (dim === 'ai_ml' && ctx.hfTopPipelineTags?.length) {
    platformLines.push(`Hugging Face pipeline 标签（样本）：${ctx.hfTopPipelineTags.slice(0, 12).join('、')}`);
  }
  if ((dim === 'backend' || dim === 'ai_ml') && ctx.stackOverflowTopTags?.length) {
    platformLines.push(`Stack Overflow 擅长标签（样本）：${ctx.stackOverflowTopTags.slice(0, 12).join('、')}`);
  }
  if (ctx.techTags?.length) {
    const tags = ctx.techTags.filter((t) => norm(t).length > 1);
    const hit = tags.filter((t) => KW[dim].some((k) => norm(t).includes(k) || k.includes(norm(t))));
    if (hit.length) platformLines.push(`画像技术标签中与该维度可能相关：${hit.slice(0, 10).join('、')}`);
  }

  return { band, languageLines, repoRows, commitRows, platformLines };
}
