/**
 * テスト用スクリプト（本番の検知ロジック・通知をそのまま使う）
 *
 * 本番の監視や state.json には一切触れない。
 * 2種類のテストを実行する:
 *   1. 通知テスト   : ダミーイベントを notify() に渡し、Discordのリッチ表示を確認
 *   2. ロジックテスト: detect() に「前回=商品A」「今回=商品A+新商品B」を与え、
 *                      Bがnewとして検知され通知されるか、全経路を確認
 *
 * 環境変数:
 *   DISCORD_WEBHOOK_URL : 通知先（未設定なら notify() は警告のみ）
 *   DRY_RUN=true        : 実送信せずログ出力のみ（手元確認用）
 */
import { loadConfig } from './config.js';
import { detect } from './detect.js';
import { notify } from './notify.js';
import type { DetectedEvent, RawItem, SourceState } from './types.js';

const config = loadConfig();
const SOURCE = { id: 'test-shop', name: 'TEST SHOP（動作確認）' };

async function testNotify(): Promise<void> {
  console.log('\n===== テスト1: 通知テスト（リッチ表示の確認） =====');
  const events: DetectedEvent[] = [
    {
      type: 'new',
      sourceId: SOURCE.id,
      sourceName: SOURCE.name,
      item: {
        id: '999000',
        name: '【テスト】新商品サンプル Tシャツ',
        url: 'https://vgiftshop.base.shop/',
        price: '¥9,999',
        soldOut: false,
      },
    },
    {
      type: 'restock',
      sourceId: SOURCE.id,
      sourceName: SOURCE.name,
      item: {
        id: '999001',
        name: '【テスト】再入荷サンプル キャップ',
        url: 'https://vgiftshop.base.shop/',
        price: '¥14,300',
        soldOut: false,
      },
    },
  ];
  await notify(events, config);
  console.log('→ Discordに「新商品」「再入荷」2件のリッチ通知が届けば成功');
}

async function testLogic(): Promise<void> {
  console.log('\n===== テスト2: ロジックテスト（検知→通知の全経路） =====');

  // 前回スナップショット: 商品Aだけが存在し、商品C はSOLD OUT
  const prev: SourceState = {
    items: {
      A: {
        id: 'A',
        name: '既存商品A（通知されないはず）',
        url: 'https://example.com/items/A',
        soldOut: false,
        firstSeen: '2026-01-01T00:00:00.000Z',
        lastSeen: '2026-01-01T00:00:00.000Z',
      },
      C: {
        id: 'C',
        name: '既存商品C（SOLD OUT → 在庫復活で再入荷判定されるはず）',
        url: 'https://example.com/items/C',
        soldOut: true,
        firstSeen: '2026-01-01T00:00:00.000Z',
        lastSeen: '2026-01-01T00:00:00.000Z',
      },
    },
    notified: {},
  };

  // 今回: A（変化なし）, C（在庫復活）, B（新商品）
  const current: RawItem[] = [
    { id: 'A', name: '既存商品A（通知されないはず）', url: 'https://example.com/items/A', soldOut: false },
    { id: 'C', name: '既存商品C（在庫復活）', url: 'https://example.com/items/C', soldOut: false },
    { id: 'B', name: '【ロジックテスト】新商品B', url: 'https://example.com/items/B', soldOut: false },
  ];

  const { events } = detect(SOURCE, prev, current, config);

  console.log(`検知イベント: ${events.length}件`);
  for (const e of events) console.log(`  - ${e.type}: ${e.item.id} (${e.item.name})`);

  // 期待: new:B と restock:C の2件。A は出ないこと。
  const types = events.map((e) => `${e.type}:${e.item.id}`).sort();
  const ok =
    types.length === 2 && types.includes('new:B') && types.includes('restock:C');
  console.log(ok ? '✅ ロジック判定: 期待通り（new:B, restock:C / A は無視）' : '❌ ロジック判定: 期待と不一致');

  // 検知できたら、その結果を実際にDiscordへ（全経路テスト）
  if (events.length > 0) {
    await notify(events, config);
    console.log('→ 上記イベントがDiscordに届けば「検知→通知」全経路が成功');
  }
}

async function main(): Promise<void> {
  console.log(`test start dryRun=${config.dryRun} webhook=${config.discordWebhookUrl ? 'set' : 'NOT SET'}`);
  await testNotify();
  await testLogic();
  console.log('\n===== テスト完了 =====');
}

main().catch((err) => {
  console.error('test fatal:', err);
  process.exit(1);
});
