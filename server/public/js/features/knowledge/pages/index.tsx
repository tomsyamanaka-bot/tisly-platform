import { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  createKnowledgeModuleItem,
  fetchKnowledgeModuleItems,
  uploadKnowledgeModulePdf,
  type KnowledgeModuleItemDto,
} from "../api/knowledgeModuleApi";
import {
  INITIAL_KNOWLEDGE_MOCK,
  KNOWLEDGE_GENRES,
  type KnowledgeGenre,
  type KnowledgeItem,
} from "../data/mockKnowledge";
import { SearchBar } from "../components/SearchBar";
import { KnowledgeCardList } from "../components/KnowledgeCard";
import { TagInput } from "../components/TagInput";
import { PdfUpload } from "../components/PdfUpload";

/** 旧 localStorage キー（移行後は未使用） */
const LEGACY_STORAGE_KEY = "tisly_knowledge_module_local_v1";

function dtoToItem(dto: KnowledgeModuleItemDto): KnowledgeItem {
  return {
    id: dto.id,
    title: dto.title,
    summary: dto.summary,
    genre: dto.genre,
    tags: dto.tags,
    pdf_url: dto.pdf_url,
    createdAt: dto.createdAt,
  };
}

/** モック + API を ID でマージ（API優先） */
function mergeItems(apiItems: KnowledgeItem[]): KnowledgeItem[] {
  const byId = new Map<string, KnowledgeItem>();
  for (const mock of INITIAL_KNOWLEDGE_MOCK) {
    byId.set(mock.id, mock);
  }
  for (const item of apiItems) {
    byId.set(item.id, item);
  }
  return [...byId.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
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
function matchesTag(item: KnowledgeItem, tag: string) {
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
 * ジャンル → タグの二段階絞り込み · PDF添付 · タグ入力
 */
function KnowledgeModulePage() {
  const [items, setItems] = useState<KnowledgeItem[]>(() => [...INITIAL_KNOWLEDGE_MOCK]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [activeGenre, setActiveGenre] = useState<KnowledgeGenre>("すべて");
  const [activeTag, setActiveTag] = useState("すべて");
  const [toast, setToast] = useState("");
  const [saving, setSaving] = useState(false);

  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [draftGenre, setDraftGenre] = useState<KnowledgeGenre>("プラント");
  const [draftTags, setDraftTags] = useState<string[]>([]);
  const [draftPdf, setDraftPdf] = useState<File | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2200);
  }, []);

  const reloadItems = useCallback(async () => {
    try {
      const { items: apiItems } = await fetchKnowledgeModuleItems();
      setItems(mergeItems(apiItems.map(dtoToItem)));
    } catch {
      showToast("サーバーから読み込めませんでした（モック表示）");
      setItems([...INITIAL_KNOWLEDGE_MOCK]);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    reloadItems();
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, [reloadItems]);

  const genreScoped = useMemo(
    () => items.filter((item) => matchesGenre(item, activeGenre)),
    [items, activeGenre]
  );

  /** 登録済みカスタムタグを動的に表示 */
  const visibleTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const item of genreScoped) {
      for (const tag of item.tags) tagSet.add(tag);
    }
    const sorted = [...tagSet].sort((a, b) => a.localeCompare(b, "ja"));
    return ["すべて", ...sorted];
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

  const handleAdd = useCallback(async () => {
    const title = draftTitle.trim();
    const summary = draftBody.trim();
    if (!title || !summary) {
      showToast("タイトルとメモを入力してください");
      return;
    }

    const tags =
      draftTags.length > 0
        ? draftTags
        : [draftGenre === "すべて" ? "アイデア" : draftGenre];

    setSaving(true);
    try {
      let pdfUrl: string | null = null;
      if (draftPdf) {
        const uploaded = await uploadKnowledgeModulePdf(draftPdf);
        pdfUrl = uploaded.pdf_url;
      }

      const created = await createKnowledgeModuleItem({
        title,
        summary,
        genre: draftGenre === "すべて" ? "プラント" : draftGenre,
        tags,
        pdf_url: pdfUrl,
      });

      setItems((prev) => mergeItems([dtoToItem(created), ...prev.filter((x) => x.id !== created.id)]));
      setDraftTitle("");
      setDraftBody("");
      setDraftTags([]);
      setDraftPdf(null);
      showToast(pdfUrl ? "PDF付きで追加しました" : "追加しました");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }, [draftTitle, draftBody, draftGenre, draftTags, draftPdf, showToast]);

  return (
    <>
      <div className="kn-hero">
        <h1>現場ナレッジ</h1>
        <p>ジャンル · タグ · PDF添付 · すぐ追加</p>
      </div>

      <SearchBar query={query} onQueryChange={setQuery} onToast={showToast} />

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
        <span className="kn-result-count">
          {loading ? "読み込み中…" : `${filtered.length}件`}
        </span>
      </div>

      <KnowledgeCardList items={filtered} />

      <section className="kn-quick-add">
        <h2 className="kn-quick-add-title">かんたん登録</h2>
        <p className="kn-quick-add-hint">タイトル · メモ · タグ · PDFを添付して追加</p>
        <input
          type="text"
          className="kn-field"
          placeholder="タイトル（1行）"
          aria-label="タイトル"
          value={draftTitle}
          disabled={saving}
          onChange={(e) => setDraftTitle(e.target.value)}
        />
        <textarea
          className="kn-field kn-field-area"
          placeholder="メモ・要約（そのまま貼り付けOK）"
          rows={4}
          aria-label="メモ"
          value={draftBody}
          disabled={saving}
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
          disabled={saving}
          onChange={(e) => setDraftGenre(e.target.value as KnowledgeGenre)}
        >
          {KNOWLEDGE_GENRES.filter((g) => g !== "すべて").map((genre) => (
            <option key={genre} value={genre}>
              {genre}
            </option>
          ))}
        </select>
        <label className="kn-field-label">タグ</label>
        <TagInput
          tags={draftTags}
          onChange={setDraftTags}
          placeholder="タグ（例: IoT, 施工方法）"
        />
        <label className="kn-field-label">PDF添付</label>
        <PdfUpload file={draftPdf} onChange={setDraftPdf} disabled={saving} />
        <button
          type="button"
          className="kn-add-btn"
          disabled={saving}
          onClick={() => void handleAdd()}
        >
          {saving ? "保存中…" : "＋ ナレッジを追加"}
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
