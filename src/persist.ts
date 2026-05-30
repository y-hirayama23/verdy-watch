import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import type { State } from './types.js';

const EMPTY_STATE: State = { updatedAt: '', sources: {} };

export async function loadState(path: string): Promise<State> {
  if (!existsSync(path)) return structuredClone(EMPTY_STATE);
  try {
    const parsed = JSON.parse(await readFile(path, 'utf-8')) as Partial<State>;
    return { updatedAt: parsed.updatedAt ?? '', sources: parsed.sources ?? {} };
  } catch {
    return structuredClone(EMPTY_STATE);
  }
}

export async function saveState(path: string, state: State): Promise<void> {
  await writeFile(path, JSON.stringify(state, null, 2) + '\n', 'utf-8');
}

/** state.json をコミット&プッシュ（CI上のみ）。変化時だけ呼ぶ前提。 */
export function commitState(path: string): void {
  const git = (args: string[]) => execFileSync('git', args, { stdio: 'pipe' }).toString();
  try {
    git(['config', 'user.name', 'verdy-watch-bot']);
    git(['config', 'user.email', 'verdy-watch-bot@users.noreply.github.com']);
    git(['add', path]);
    try {
      execFileSync('git', ['diff', '--cached', '--quiet'], { stdio: 'pipe' });
      return; // 差分なし
    } catch {
      /* 差分あり → コミットへ */
    }
    git(['commit', '-m', `chore: update state ${new Date().toISOString()}`]);
    try {
      git(['push']);
    } catch {
      git(['pull', '--rebase', '--autostash']);
      git(['push']);
    }
  } catch (err) {
    console.error('commitState error (non-fatal):', err);
  }
}
