import type { Config } from './config.js';
import type { DetectedEvent } from './types.js';

const LABEL: Record<DetectedEvent['type'], string> = {
  new: '🟢 新商品',
  restock: '🔵 再入荷',
};

async function postDiscord(webhookUrl: string, events: DetectedEvent[]): Promise<void> {
  const embeds = events.slice(0, 10).map((e) => ({
    title: `${LABEL[e.type]}: ${e.item.name}`,
    url: e.item.url,
    description: e.item.price ? `💰 ${e.item.price}` : undefined,
    author: { name: e.sourceName }, // どの店かを表示
    color: e.type === 'new' ? 0x00b894 : 0x0984e3,
  }));
  const content =
    events.length === 1
      ? `${LABEL[events[0].type]}（${events[0].sourceName}）`
      : `${events.length}件の変化を検出`;

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, embeds }),
  });
  if (!res.ok) throw new Error(`Discord failed: ${res.status} ${await res.text()}`);
}

async function postNtfy(ntfyUrl: string, events: DetectedEvent[]): Promise<void> {
  const title =
    events.length === 1
      ? `${LABEL[events[0].type]} - ${events[0].sourceName}`
      : `${events.length}件の変化を検出`;
  const body = events
    .slice(0, 10)
    .map((e) => `[${e.sourceName}] ${LABEL[e.type]}: ${e.item.name}\n${e.item.url}`)
    .join('\n\n');

  const res = await fetch(ntfyUrl, {
    method: 'POST',
    headers: {
      Title: encodeURIComponent(title),
      Tags: events.some((e) => e.type === 'new') ? 'shopping' : 'arrows_clockwise',
      Click: events[0]?.item.url ?? '',
    },
    body,
  });
  if (!res.ok) throw new Error(`ntfy failed: ${res.status} ${await res.text()}`);
}

/** 設定された全チャネルへ通知。1チャネルの失敗が他を止めない。 */
export async function notify(events: DetectedEvent[], config: Config): Promise<void> {
  if (events.length === 0) return;

  if (config.dryRun) {
    console.log('[DRY_RUN] would notify:');
    for (const e of events) {
      console.log(`  [${e.sourceName}] ${LABEL[e.type]} ${e.item.name} -> ${e.item.url}`);
    }
    return;
  }

  const tasks: Promise<void>[] = [];
  if (config.discordWebhookUrl) {
    tasks.push(postDiscord(config.discordWebhookUrl, events).catch((e) => console.error('Discord:', e)));
  }
  if (config.ntfyUrl) {
    tasks.push(postNtfy(config.ntfyUrl, events).catch((e) => console.error('ntfy:', e)));
  }
  if (tasks.length === 0) {
    console.warn('No notification channel configured (DISCORD_WEBHOOK_URL or NTFY_URL)');
  }
  await Promise.all(tasks);
}

/** セレクタ崩壊などの運用アラート */
export async function notifyOps(message: string, config: Config): Promise<void> {
  console.warn('[OPS]', message);
  if (config.dryRun || !config.discordWebhookUrl) return;
  await fetch(config.discordWebhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: `⚠️ verdy-watch: ${message}` }),
  }).catch((e) => console.error('Ops notify:', e));
}
