import type { Platform } from './types.js';

export interface SourceConfig {
  id: string; // 状態の名前空間キー（ユニーク・空白なし）
  name: string; // 通知に表示する店名
  url: string; // 監視URL
  platform: Platform;
  enabled: boolean;
  /** generic用: 商品リンクを拾う正規表現（パス部分にマッチ、グループ1をID扱い） */
  productPathPattern?: string;
  note?: string;
}

/**
 * 監視対象。enabled:false のものはスキップされる。
 * 新しい店を足すときはここに1行追加するだけ。
 */
export const SOURCES: SourceConfig[] = [
  {
    id: 'verdy',
    name: "Verdy's Gift Shop",
    url: 'https://vgiftshop.base.shop/',
    platform: 'base',
    enabled: true,
  },
  {
    id: 'everyone',
    name: 'everyone tokyo',
    url: 'https://www.everyonetokyo.com/',
    platform: 'base',
    enabled: true,
  },
  {
    id: 'cottonpan',
    name: 'cottonpan',
    url: 'https://cottonpan.thebase.in/',
    platform: 'base',
    enabled: true,
  },
  {
    id: 'niceness-ss26',
    name: 'NICENESS SS26',
    url: 'https://www.niceness.jp/products-season/ss26/',
    platform: 'generic',
    // /products/{slug}/ を商品とみなす。/products-season/ は除外される。
    productPathPattern: '/products/([^/?#]+)',
    enabled: true,
  },
  // ─────────────────────────────────────────────────────────────
  // ⚠️ Nepenthes (Needles): robots.txt が自動アクセスを拒否している。
  // 監視するとBAN対象になり得る & サイトの明示的意思に反する。
  // 有効化は自己責任。代わりに公式Instagram/メルマガ購読を推奨。
  // ─────────────────────────────────────────────────────────────
  {
    id: 'needles',
    name: 'Nepenthes / Needles',
    url: 'https://onlinestore.nepenthes.co.jp/collections/needles?sort_by=created-descending',
    platform: 'shopify',
    enabled: false, // ← robots.txt拒否のためデフォルト無効
    note: 'robots.txt disallows automated access',
  },
];
