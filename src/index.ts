import { loadConfig } from './config.js';
import { runCycle } from './cycle.js';
import { commitState, loadState, saveState } from './persist.js';
import { SOURCES } from './sources.js';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  const config = loadConfig();
  const mode = process.env.RUN_MODE ?? 'loop'; // 'loop' | 'once'
  const active = SOURCES.filter((s) => s.enabled).map((s) => s.name);

  console.log(
    `verdy-watch start mode=${mode} sources=[${active.join(', ')}] ` +
      `poll=${config.pollIntervalSec}s maxRuntime=${config.maxRuntimeSec}s ` +
      `dryRun=${config.dryRun} persistGit=${config.persistGit}`,
  );

  let state = await loadState(config.statePath);
  const emptyCounts: Record<string, number> = {};

  if (mode === 'once') {
    const r = await runCycle(state, config, emptyCounts);
    console.log(`once: changed=${r.changed}`);
    return;
  }

  const deadline = Date.now() + config.maxRuntimeSec * 1000;
  let cycle = 0;
  let stopping = false;
  const onSignal = () => {
    console.log('signal received, stopping after current cycle');
    stopping = true;
  };
  process.on('SIGTERM', onSignal);
  process.on('SIGINT', onSignal);

  while (Date.now() < deadline && !stopping) {
    cycle += 1;
    const started = Date.now();
    try {
      const r = await runCycle(state, config, emptyCounts);
      state = r.state;
      if (cycle % 10 === 0 || r.changed) {
        console.log(`cycle=${cycle} changed=${r.changed} t=${new Date().toISOString()}`);
      }
    } catch (err) {
      console.error(`cycle=${cycle} error:`, err);
    }
    const wait = Math.max(0, config.pollIntervalSec * 1000 - (Date.now() - started));
    if (Date.now() + wait >= deadline) break;
    await sleep(wait);
  }

  console.log(`loop finished after ${cycle} cycles. Handing off.`);
  if (config.persistGit) {
    state.updatedAt = new Date().toISOString();
    await saveState(config.statePath, state);
    commitState(config.statePath);
  }
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
