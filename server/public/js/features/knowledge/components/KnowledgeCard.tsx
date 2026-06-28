import type { KnowledgeItem } from "../data/mockKnowledge";

export interface KnowledgeCardProps {
  item: KnowledgeItem;
}

/**
 * ナレッジ1件のカード
 * タイトル大きめ・要約3行想定
 */
export function KnowledgeCard({ item }: KnowledgeCardProps) {
  return (
    <article className="kn-card" data-id={item.id}>
      <h2 className="kn-card-title">{item.title}</h2>
      <p className="kn-card-summary">{item.summary}</p>
      <div className="kn-card-tags">
        {item.tags.map((tag) => (
          <span key={tag} className="kn-card-tag">
            #{tag}
          </span>
        ))}
      </div>
    </article>
  );
}

export interface KnowledgeCardListProps {
  items: KnowledgeItem[];
}

/** カード一覧（0件時は案内文） */
export function KnowledgeCardList({ items }: KnowledgeCardListProps) {
  if (items.length === 0) {
    return <p className="kn-empty">該当するナレッジがありません</p>;
  }

  return (
    <div className="kn-card-list">
      {items.map((item) => (
        <KnowledgeCard key={item.id} item={item} />
      ))}
    </div>
  );
}
