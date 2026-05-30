import * as cheerio from 'cheerio';
import { fetchJson, fetchText } from './http.js';
import type { RawItem } from './types.js';
import type { SourceConfig } from './sources.js';

const SOLD_OUT_RE = /sold\s*out|売\s*り?\s*切\s*れ|完売/i;

/** BASE: 商品リンク a[href*="/items/"]、ID = /items/(\d+) */
export function parseBase(html: string, baseUrl: string): RawItem[] {
  const $ = cheerio.load(html);
  const out = new Map<string, RawItem>();

  $('a[href*="/items/"]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    const absUrl = href.startsWith('http') ? href : new URL(href, baseUrl).toString();
    const m = absUrl.match(/\/items\/(\d+)/);
    if (!m) return;
    const id = m[1];

    const container = $(el).closest('li, .item, [class*="item"], [class*="Item"], article');
    const scope = container.length ? container : $(el);

    const nameCandidate =
      scope.find('h1,h2,h3,h4,.item-name,.itemName,[class*="name"]').first().text().trim() ||
      $(el).text().trim();
    const name = (nameCandidate || `(no name) ${id}`).replace(/\s+/g, ' ').slice(0, 200);
    const price = scope.find('.item-price,.itemPrice,[class*="price"]').first().text().trim();
    const soldOut = SOLD_OUT_RE.test(scope.text()) || /soldout/i.test(scope.attr('class') ?? '');

    const existing = out.get(id);
    if (existing && !existing.name.startsWith('(no name)')) return;
    out.set(id, { id, name, url: absUrl, price: price || undefined, soldOut });
  });

  return [...out.values()];
}

/** generic: 任意サイト。productPathPattern で商品リンクを抽出、グループ1をID(slug)に */
export function parseGeneric(
  html: string,
  baseUrl: string,
  pattern: string,
): RawItem[] {
  const $ = cheerio.load(html);
  const re = new RegExp(pattern);
  const out = new Map<string, RawItem>();

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    const absUrl = href.startsWith('http') ? href : new URL(href, baseUrl).toString();
    const path = new URL(absUrl).pathname;
    const m = path.match(re);
    if (!m) return;
    const id = m[1] ?? m[0];

    const name = ($(el).text().trim() || `(no name) ${id}`)
      .replace(/\s+/g, ' ')
      .slice(0, 200);

    // 既出は名前が取れている方を優先
    const existing = out.get(id);
    if (existing && !existing.name.startsWith('(no name)')) return;
    out.set(id, { id, name, url: absUrl, soldOut: false });
  });

  return [...out.values()];
}

interface ShopifyVariant {
  available?: boolean;
  price?: string;
}
interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  variants?: ShopifyVariant[];
}
interface ShopifyProductsResponse {
  products: ShopifyProduct[];
}

/** Shopify: コレクションURL → /products.json（堅牢なJSON取得） */
export function shopifyProductsJsonUrl(url: string): string {
  const u = new URL(url);
  u.search = '';
  let path = u.pathname.replace(/\/$/, '');
  // /collections/xxx → /collections/xxx/products.json、ルートなら /products.json
  if (/\/collections\/[^/]+$/.test(path)) {
    path = `${path}/products.json`;
  } else {
    path = '/products.json';
  }
  u.pathname = path;
  u.search = '?limit=250';
  return u.toString();
}

export function parseShopify(json: ShopifyProductsResponse, baseUrl: string): RawItem[] {
  const origin = new URL(baseUrl).origin;
  return (json.products ?? []).map((p) => {
    const variants = p.variants ?? [];
    const soldOut = variants.length > 0 && !variants.some((v) => v.available !== false);
    return {
      id: String(p.id),
      name: p.title,
      url: `${origin}/products/${p.handle}`,
      price: variants[0]?.price ? `¥${variants[0].price}` : undefined,
      soldOut,
    };
  });
}

/** ソース定義に応じて適切なアダプターでfetch+parse */
export async function fetchSource(
  source: SourceConfig,
  userAgent: string,
): Promise<RawItem[]> {
  switch (source.platform) {
    case 'base': {
      const html = await fetchText(source.url, userAgent);
      return parseBase(html, source.url);
    }
    case 'generic': {
      if (!source.productPathPattern) {
        throw new Error(`generic source ${source.id} requires productPathPattern`);
      }
      const html = await fetchText(source.url, userAgent);
      return parseGeneric(html, source.url, source.productPathPattern);
    }
    case 'shopify': {
      const jsonUrl = shopifyProductsJsonUrl(source.url);
      const json = await fetchJson<ShopifyProductsResponse>(jsonUrl, userAgent);
      return parseShopify(json, source.url);
    }
  }
}
