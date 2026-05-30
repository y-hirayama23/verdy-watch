import { fetchSource } from './adapters.js';
import type { Config } from './config.js';
import { detect } from './detect.js';
import { notify, notifyOps } from './notify.js';
import { commitState, saveState } from './persist.js';
import { SOURCES } from './sources.js';
import type { DetectedEvent, SourceState, State } from './types.js';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function emptySourceState(): SourceState {
  return { items: {}, notified: {} };
}

export interface CycleResult {
  state: State;
  changed: boolean;
}

/**
 * 1サイクル: 有効な全ソースを順に fetch → detect → 集約して通知。
 * ソース単位の失敗は他に波及させない。ソース間は少し間を空ける(礼儀)。
 */
export async function runCycle(
  prevState: State,
  config: Config,
  emptyCounts: Record<string, number>,
): Promise<CycleResult> {
  const sources = SOURCES.filter((s) => s.enabled);
  const allEvents: DetectedEvent[] = [];
  const nextState: State = { updatedAt: new Date().toISOString(), sources: { ...prevState.sources } };
  let changed = false;

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    const prevSourceState = prevState.sources[source.id] ?? emptySourceState();

    try {
      const items = await fetchSource(source, config.userAgent);

      if (items.length === 0) {
        emptyCounts[source.id] = (emptyCounts[source.id] ?? 0) + 1;
        if (emptyCounts[source.id] === 3) {
          await notifyOps(`[${source.name}] parsed 0 items 3x. Adapter/selector may be broken.`, config);
        }
        nextState.sources[source.id] = prevSourceState; // 状態を壊さない
        continue;
      }
      emptyCounts[source.id] = 0;

      const { events, nextState: nextSourceState } = detect(
        { id: source.id, name: source.name },
        prevSourceState,
        items,
        config,
      );
      nextState.sources[source.id] = nextSourceState;

      if (events.length > 0) allEvents.push(...events);
      if (JSON.stringify(prevSourceState.items) !== JSON.stringify(nextSourceState.items)) {
        changed = true;
      }
    } catch (err) {
      console.error(`[${source.name}] fetch error:`, err instanceof Error ? err.message : err);
      nextState.sources[source.id] = prevSourceState;
    }

    if (i < sources.length - 1) await sleep(config.perSourceDelayMs);
  }

  if (allEvents.length > 0) await notify(allEvents, config);

  await saveState(config.statePath, nextState);
  if (changed && config.persistGit) commitState(config.statePath);

  return { state: nextState, changed };
}
