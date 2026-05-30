import type { Config } from './config.js';
import type { DetectedEvent, RawItem, SourceState, StoredItem } from './types.js';

function matchesKeywords(item: RawItem, keywords: string[]): boolean {
  if (keywords.length === 0) return true;
  const hay = `${item.name} ${item.url}`.toLowerCase();
  return keywords.some((k) => hay.includes(k.toLowerCase()));
}

function withinTtl(iso: string | undefined, ttlHours: number, now: Date): boolean {
  if (!iso) return false;
  return now.getTime() - new Date(iso).getTime() < ttlHours * 3600_000;
}

export interface DetectResult {
  events: DetectedEvent[];
  nextState: SourceState;
}

/**
 * 1ソース分の差分検出。new / restock を判定し、keyword filter と dedup TTL を適用。
 */
export function detect(
  source: { id: string; name: string },
  prev: SourceState,
  current: RawItem[],
  config: Config,
  now: Date = new Date(),
): DetectResult {
  const nowIso = now.toISOString();
  const isFirstRun = Object.keys(prev.items).length === 0;
  const events: DetectedEvent[] = [];

  const nextItems: Record<string, StoredItem> = {};
  const nextNotified: Record<string, string> = { ...prev.notified };

  for (const item of current) {
    const prevItem = prev.items[item.id];
    nextItems[item.id] = {
      ...item,
      firstSeen: prevItem?.firstSeen ?? nowIso,
      lastSeen: nowIso,
    };

    if (isFirstRun) continue;

    let type: DetectedEvent['type'] | null = null;
    if (!prevItem) type = 'new';
    else if (prevItem.soldOut && !item.soldOut) type = 'restock';
    if (!type) continue;
    if (!matchesKeywords(item, config.keywords)) continue;

    const key = `${item.id}:${type}`;
    if (withinTtl(nextNotified[key], config.dedupTtlHours, now)) continue;

    events.push({ type, item, sourceId: source.id, sourceName: source.name });
    nextNotified[key] = nowIso;
  }

  // 古いnotified記録を掃除（TTLの2倍超）
  for (const [key, iso] of Object.entries(nextNotified)) {
    if (!withinTtl(iso, config.dedupTtlHours * 2, now)) delete nextNotified[key];
  }

  return { events, nextState: { items: nextItems, notified: nextNotified } };
}
