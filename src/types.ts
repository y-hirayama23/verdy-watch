export type ItemEventType = 'new' | 'restock';
export type Platform = 'base' | 'shopify' | 'generic';

/** スクレイプ直後の生データ */
export interface RawItem {
  id: string;
  name: string;
  url: string;
  price?: string;
  soldOut: boolean;
}

export interface StoredItem extends RawItem {
  firstSeen: string;
  lastSeen: string;
}

/** 1ソース(=1サイト/1コレクション)分の状態 */
export interface SourceState {
  items: Record<string, StoredItem>;
  /** dedup用: `${id}:${eventType}` -> ISO */
  notified: Record<string, string>;
}

/** state.json 全体。ソースIDで名前空間を分離（店舗間のID衝突回避） */
export interface State {
  updatedAt: string;
  sources: Record<string, SourceState>;
}

export interface DetectedEvent {
  type: ItemEventType;
  item: RawItem;
  sourceId: string;
  sourceName: string;
}
