import { useCallback, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  INITIAL_KNOWLEDGE_MOCK,
  KNOWLEDGE_GENRES,
  QUICK_TAGS,
  type KnowledgeGenre,
  type KnowledgeItem,
  type QuickTag,
} from "../data/mockKnowledge";
import { SearchBar } from "../components/SearchBar";
import { KnowledgeCardList } from "../components/KnowledgeCard";

const STORAGE_KEY = "tisly_knowledge_module_local_v1";

/** localStorage と初期モックをマージ */
function loadItems(): KnowledgeItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...INITIAL_KNOWLEDGE_MOCK];
    const parsed = JSON.parse(raw) as KnowledgeItem[];
    if (!Array.isArray(parsed)) return [...INITIAL_KNOWLEDGE_MOCK];
    const ids = new Set(parsed.map((x) => x.id));
    const seeded = INITIAL_KNOWLEDGE_MOCK.filter((m) => !ids.has(m.id));
    const normalized = parsed.map((item) => ({
      ...item,
      genre: item.genre?.trim() || inferGenreFromTags(item.tags),
    }));
    return [...seeded, ...normalized];
  } catch {
    return [...INITIAL_KNOWLEDGE_MOCK];
  }
}

/** 旧データ向け：タグからジャンルを推定 */
function inferGenreFromTags(tags: string[]): string {
  const genreTags = KNOWLEDGE_GENRES.filter((g) => g !== "すべて");
  for (const genre of genreTags) {
    if (tags.includes(genre)) return genre;
  }
  if (tags.includes("PLC")) return "制御";
  return "プラント";
}

/** ユーザー追加分のみ永続化 */
function persistUserItems(items: KnowledgeItem[]) {
  const mockIds = new Set(INITIAL_KNOWLEDGE_MOCK.map((m) => m.id));
  const userOnly = items.filter((x) => !mockIds.has(x.id));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(userOnly));
}

/** タイトル・要約のあいまい検索 */
function matchesQuery(item: KnowledgeItem, q: string) {
  if (!q.trim()) return true;
  const needle = q.trim().toLowerCase();
  return `${item.title} ${item.summary}`.toLowerCase().includes(needle);
}

/** ジャンルタブでの絞り込み（第1段階） */
function matchesGenre(item: KnowledgeItem, genre: KnowledgeGenre) {
  if (genre === "すべて") return true;
  return item.genre === genre;
}

/** タグボタンでの絞り込み（第2段階） */
function matchesTag(item: KnowledgeItem, tag: QuickTag) {
  if (tag === "すべて") return true;
  return item.tags.includes(tag);
}

function Toast({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="kn-toast is-visible" role="status">
      {message}
    </div>
  );
}

/**
 * Knowledge メイン画面
 * ジャンル → タグの二段階絞り込み
 */
function KnowledgeModulePage() {
  const [items, setItems] = useState<KnowledgeItem[]>(() => loadItems());
  const [query, setQuery] = useState("");
  const [activeGenre, setActiveGenre] = useState<KnowledgeGenre>("すべて");
  const [activeTag, setActiveTag] = useState<QuickTag>("すべて");
  const [toast, setToast] = useState("");

  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [draftGenre, setDraftGenre] = useState<KnowledgeGenre>("プラント");
  const [draftTags, setDraftTags] = useState("");

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2200);
  }, []);

  const genreScoped = useMemo(
    () => items.filter((item) => matchesGenre(item, activeGenre)),
    [items, activeGenre]
  );

  const visibleTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const item of genreScoped) {
      for (const tag of item.tags) tagSet.add(tag);
    }
    const ordered = QUICK_TAGS.filter(
      (tag) => tag === "すべて" || tagSet.has(tag)
    );
    return ordered.length > 1 ? ordered : (["すべて"] as QuickTag[]);
  }, [genreScoped]);

  const filtered = useMemo(
    () =>
      genreScoped.filter(
        (item) => matchesQuery(item, query) && matchesTag(item, activeTag)
      ),
    [genreScoped, query, activeTag]
  );

  const handleGenreChange = useCallback((genre: KnowledgeGenre) => {
    setActiveGenre(genre);
    setActiveTag("すべて");
  }, []);

  const handleAdd = useCallback(() => {
    const title = draftTitle.trim();
    const summary = draftBody.trim();
    if (!title || !summary) {
      showToast("タイトルとメモを入力してください");
      return;
    }

    const tags = draftTags
      .split(/[,、\s#]+/)
      .map((t) => t.trim())
      .filter(Boolean);

    const item: KnowledgeItem = {
      id: `kn-user-${Date.now()}`,
      title,
      summary,
      genre: draftGenre === "すべて" ? "プラント" : draftGenre,
      tags: tags.length ? tags : ["アイデア"],
      createdAt: new Date().toISOString(),
    };

    const next = [item, ...items];
    setItems(next);
    persistUserItems(next);
    setDraftTitle("");
    setDraftBody("");
    setDraftTags("");
    showToast("追加しました");
  }, [draftTitle, draftBody, draftGenre, draftTags, items, showToast]);

  return (
    <>
      <div className="kn-hero">
        <h1>現場ナレッジ</h1>
        <p>ジャンル · タグ · すぐ追加</p>
      </div>

      <SearchBar
        query={query}
        onQueryChange={setQuery}
        onToast={showToast}
      />

      <div className="kn-genre-tabs" role="tablist" aria-label="ジャンル">
        {KNOWLEDGE_GENRES.map((genre) => (
          <button
            key={genre}
            type="button"
            role="tab"
            aria-selected={activeGenre === genre}
            className={`kn-genre-tab${activeGenre === genre ? " is-active" : ""}`}
            data-genre={genre}
            onClick={() => handleGenreChange(genre)}
          >
            {genre}
          </button>
        ))}
      </div>

      <div className="kn-quick-tags" aria-label="タグ絞り込み">
        {visibleTags.map((tag) => (
          <button
            key={tag}
            type="button"
            className={`kn-quick-tag${activeTag === tag ? " is-active" : ""}`}
            data-tag={tag}
            onClick={() => setActiveTag(tag)}
          >
            #{tag}
          </button>
        ))}
      </div>

      <div className="kn-results-head">
        <h2>一覧</h2>
        <span className="kn-result-count">{filtered.length}件</span>
      </div>

      <KnowledgeCardList items={filtered} />

      <section className="kn-quick-add">
        <h2 className="kn-quick-add-title">かんたん登録</h2>
        <p className="kn-quick-add-hint">タイトルとメモを貼って追加</p>
        <input
          type="text"
          className="kn-field"
          placeholder="タイトル（1行）"
          aria-label="タイトル"
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
        />
        <textarea
          className="kn-field kn-field-area"
          placeholder="メモ・要約（そのまま貼り付けOK）"
          rows={4}
          aria-label="メモ"
          value={draftBody}
          onChange={(e) => setDraftBody(e.target.value)}
        />
        <label className="kn-field-label" htmlFor="kn-draft-genre">
          ジャンル
        </label>
        <select
          id="kn-draft-genre"
          className="kn-field"
          aria-label="ジャンル"
          value={draftGenre}
          onChange={(e) => setDraftGenre(e.target.value as KnowledgeGenre)}
        >
          {KNOWLEDGE_GENRES.filter((g) => g !== "すべて").map((genre) => (
            <option key={genre} value={genre}>
              {genre}
            </option>
          ))}
        </select>
        <input
          type="text"
          className="kn-field"
          placeholder="タグ（例: IoT, 施工方法）"
          aria-label="タグ"
          value={draftTags}
          onChange={(e) => setDraftTags(e.target.value)}
        />
        <button type="button" className="kn-add-btn" onClick={handleAdd}>
          ＋ ナレッジを追加
        </button>
      </section>

      <Toast message={toast} />
    </>
  );
}

const mount = document.getElementById("kn-root");
if (mount) {
  createRoot(mount).render(<KnowledgeModulePage />);
}
