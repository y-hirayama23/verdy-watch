# Multi-Shop Watch

複数のオンラインストアのゲリラ販売/新商品/再入荷を**実質60秒間隔・完全無料**で監視し、スマホにPush通知する自作ツール。

## 監視対象（src/sources.ts で管理）

| ID | 店名 | プラットフォーム | 状態 |
|---|---|---|---|
| `verdy` | Verdy's Gift Shop | BASE | 有効 |
| `everyone` | everyone tokyo | BASE | 有効 |
| `cottonpan` | cottonpan | BASE | 有効 |
| `niceness-ss26` | NICENESS SS26 | WordPress (generic) | 有効 |
| `needles` | Nepenthes / Needles | Shopify | **無効**（後述） |

店を増減するときは `src/sources.ts` の配列を1行編集するだけ。

### ⚠️ Nepenthes (Needles) について

Nepenthesのオンラインストアは **robots.txt で自動アクセスを拒否**している。
監視するとBAN対象になり得るうえ、サイトの明示的な意思に反するため**デフォルト無効**にしてある。
有効化は自己責任。代わりに公式Instagram / メルマガ購読を推奨。
有効化する場合は `src/sources.ts` の `needles` を `enabled: true` に変更。

## 何ができるか

- **新商品検知**（new）: 未知の商品IDが出現
- **再入荷検知**（restock）: SOLD OUT → 在庫復活（BASE / Shopify）
- **全店横断のキーワード絞り込み**（`KEYWORDS`）
- **重複抑止**（同一商品×同一イベントを `DEDUP_TTL_HOURS` 内は再通知しない）
- 通知は **どの店か** を明示

## 仕組み（チェーン方式・v2から継続）

```
[Run A] 60秒ループで全有効ソースを巡回(5h45m) ─┐ (終了時)
                                              └→ gh workflow run（自己再dispatch）
[Run B] concurrencyでpending → Aの完了後に起動 → 60秒ループ… （無限チェーン）
```

- **concurrency = singleton**: 常に1本だけ稼働。二重ループも途切れも起きない
- **GITHUB_TOKENで自己dispatch可**（PAT不要）
- **パブリックリポジトリはActions無料・無制限** → ほぼ常時稼働でも0円
- 30分cronは、チェーンが切れた時だけ起動する保険

各サイクルで全ソースを順に巡回し、ソース間は `PER_SOURCE_DELAY_MS`(既定1.5秒)空ける。
1ソースのfetch失敗は他に波及しない。

## プラットフォーム別アダプター（src/adapters.ts）

- **base**: `a[href*="/items/"]`、ID=`/items/{数字}`、SOLD OUTテキスト判定
- **shopify**: コレクションURL → `/products.json?limit=250` を取得（HTMLスクレイプより堅牢）。variant.availableで在庫判定
- **generic**: `productPathPattern`(正規表現)で商品リンクを抽出。NICENESSは `/products/([^/?#]+)`

## セットアップ

### 1. 通知先（どちらか/両方）

**Discord**: サーバー → チャンネル設定 → 連携サービス → ウェブフック → URLコピー
**ntfy**（登録不要）: アプリで秘密トピックを購読 → `https://ntfy.sh/<秘密の文字列>`

### 2. リポジトリ作成（必ず public）

```bash
cd multi-shop-watch
git init && git add . && git commit -m "init"
gh repo create multi-shop-watch --public --source=. --push
```

### 3. Secrets

```bash
gh secret set DISCORD_WEBHOOK_URL --body "https://discord.com/api/webhooks/..."
gh secret set NTFY_URL --body "https://ntfy.sh/xxxx"   # ntfy使用時のみ
```

### 4. 起動

Actionsタブ → `Verdy Watch` → `Run workflow`。以降は自動で再起動し続ける。
各ソースの初回サイクルはベースライン作成のみ（通知なし）。

## ローカルテスト

```bash
npm install
DRY_RUN=true RUN_MODE=once npm run once   # 1巡だけ実行・通知はログ出力のみ
```

## 設定（watch.yml の env）

| 変数 | 既定 | 説明 |
|---|---|---|
| `POLL_INTERVAL_SEC` | 60 | 1巡あたりの間隔（秒） |
| `MAX_RUNTIME_SEC` | 20700 | 1リンクの稼働秒数（5h45m） |
| `DEDUP_TTL_HOURS` | 12 | 同一商品×同一イベントの再通知抑止時間 |
| `PER_SOURCE_DELAY_MS` | 1500 | ソース間の待機 |
| `KEYWORDS` | （空） | 全店横断の絞り込み。例 `Girls Don't Cry,Wasted Youth` |

## チューニング

### あるソースで parsed=0 が続く場合

3回連続0件で `[店名] parsed 0 items 3x` のDiscord警告が飛ぶ。
- BASE/generic: `src/adapters.ts` のセレクタ/正規表現を調整
- 実HTML確認: `curl -A "verdy-watch/2.0" <URL> > page.html`

### 店を追加

`src/sources.ts` に追記:

```ts
{ id: 'newshop', name: 'New Shop', url: 'https://...', platform: 'base', enabled: true }
```

generic なら `productPathPattern` も指定。

## ファイル構成

```
src/
  types.ts     型定義
  config.ts    環境変数
  sources.ts   ★監視対象サイトの定義（ここを編集して店を増減）
  http.ts      fetch（リトライ付き）
  adapters.ts  ★BASE / Shopify / generic アダプター
  detect.ts    new/restock判定 + keyword + dedup（ソース別）
  notify.ts    Discord / ntfy 通知（店名表示）
  cycle.ts     全ソースを巡回する1サイクル
  persist.ts   state.json（ソース別名前空間）+ git commit
  index.ts     エントリ（loop / once）
.github/workflows/watch.yml   チェーン方式ワークフロー
state.json     監視状態（自動更新）
```

## マナー / 注意

- robots.txt を尊重する（Nepenthesは拒否しているので無効にしてある）
- User-Agent明示・60秒間隔・ソース間ディレイを守る
- 個人の購入用途に限る。転売目的の大量監視には使わない
