export interface Config {
  targetUrl: string;
  discordWebhookUrl?: string;
  ntfyUrl?: string; // 例: https://ntfy.sh/your-secret-topic
  pollIntervalSec: number;
  maxRuntimeSec: number;
  dedupTtlHours: number;
  keywords: string[]; // 空なら全件通知。指定時はいずれか含む商品のみ
  userAgent: string;
  statePath: string;
  persistGit: boolean; // CI上でstate.jsonをコミットするか
  dryRun: boolean; // trueなら通知をPOSTせずログ出力のみ
  perSourceDelayMs: number; // ソース間の待機（礼儀）
}

function num(name: string, def: number): number {
  const v = process.env[name];
  if (!v) return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function bool(name: string, def: boolean): boolean {
  const v = process.env[name];
  if (v === undefined) return def;
  return v === '1' || v.toLowerCase() === 'true';
}

export function loadConfig(): Config {
  return {
    targetUrl: process.env.TARGET_URL ?? 'https://vgiftshop.base.shop/',
    discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL || undefined,
    ntfyUrl: process.env.NTFY_URL || undefined,
    pollIntervalSec: num('POLL_INTERVAL_SEC', 60),
    // 6時間=21600秒。再起動の余裕を見て 5h45m を上限に。
    maxRuntimeSec: num('MAX_RUNTIME_SEC', 20700),
    dedupTtlHours: num('DEDUP_TTL_HOURS', 12),
    keywords: (process.env.KEYWORDS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    userAgent:
      process.env.USER_AGENT ??
      'verdy-watch/2.0 (+personal monitoring; 60s interval; respects robots.txt)',
    statePath: process.env.STATE_PATH ?? 'state.json',
    persistGit: bool('PERSIST_GIT', false),
    dryRun: bool('DRY_RUN', false),
    perSourceDelayMs: num('PER_SOURCE_DELAY_MS', 1500),
  };
}
