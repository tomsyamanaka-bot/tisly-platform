import { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  createKnowledgeModuleItem,
  fetchKnowledgeModuleItems,
  updateKnowledgeModuleItem,
  uploadKnowledgeModuleFiles,
  type KnowledgeModuleMediaDto,
  type KnowledgeModuleItemDto,
} from "../api/knowledgeModuleApi";
import {
  KNOWLEDGE_GENRES,
  type KnowledgeGenre,
  type KnowledgeItem,
} from "../data/mockKnowledge";
import { SearchBar } from "../components/SearchBar";
import {
  KnowledgeCardList,
  KnowledgeMediaGallery,
} from "../components/KnowledgeCard";
import { TagInput } from "../components/TagInput";
import { PdfUpload } from "../components/PdfUpload";
import {
  normalizeKnowledgeMediaAttachments,
  type KnowledgeMediaAttachment,
} from "../utils/mediaAttachment";

/** 旧 localStorage キー（移行後は未使用） */
const LEGACY_STORAGE_KEY = "tisly_knowledge_module_local_v1";

function dtoToItem(dto: KnowledgeModuleItemDto): KnowledgeItem {
  return {
    id: dto.id,
    title: dto.title,
    summary: dto.summary,
    genre: dto.genre,
    tags: dto.tags ?? [],
    pdf_url: dto.pdf_url ?? null,
    medias: dto.medias,
    files: dto.files,
    media: dto.media,
    file: dto.file,
    createdAt: dto.createdAt,
    body: dto.body,
  };
}

interface KnowledgeEditDraft {
  item: KnowledgeItem;
  title: string;
  summary: string;
  genre: KnowledgeGenre;
  tags: string[];
  existingMedias: KnowledgeMediaAttachment[];
  newFiles: File[];
}

function sortItems(items: KnowledgeItem[]): KnowledgeItem[] {
  return [...items].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/** タイトル・要約・タグのあいまい検索 */
function matchesQuery(item: KnowledgeItem, q: string) {
  if (!q.trim()) return true;
  const needle = q.trim().toLowerCase();
  const haystack =
    `${item.title} ${item.summary} ${item.body ?? ""} ${item.tags.join(" ")}`.toLowerCase();
  return haystack.includes(needle);
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
 * ジャンル → タグ絞り込み ·
 * メディア添付 · タグ入力
 */
function KnowledgeModulePage() {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [activeGenre, setActiveGenre] = useState<KnowledgeGenre>("すべて");
  const [activeTag, setActiveTag] = useState("すべて");
  const [toast, setToast] = useState("");
  const [saving, setSaving] = useState(false);
  const [detailItem, setDetailItem] = useState<KnowledgeItem | null>(null);
  const [editDraft, setEditDraft] = useState<KnowledgeEditDraft | null>(null);

  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [draftGenre, setDraftGenre] = useState<KnowledgeGenre>("プラント");
  const [draftTags, setDraftTags] = useState<string[]>([]);
  const [draftFiles, setDraftFiles] = useState<File[]>([]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2200);
  }, []);

  const reloadItems = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const { items: apiItems } = await fetchKnowledgeModuleItems();
      setItems(sortItems(apiItems.map(dtoToItem)));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "読み込みに失敗しました";
      setLoadError(msg);
      setItems([]);
      showToast(`サーバーから読み込めませんでした: ${msg}`);
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
    if (!title) {
      showToast("タイトルを入力してください");
      return;
    }
    if (!summary && draftFiles.length === 0) {
      showToast("メモを入力するか、ファイルを添付してください");
      return;
    }

    const tags =
      draftTags.length > 0
        ? draftTags
        : [draftGenre === "すべて" ? "アイデア" : draftGenre];

    setSaving(true);
    try {
      const medias = await uploadKnowledgeModuleFiles(draftFiles);
      const pdfUrl = medias[0]?.url ?? null;

      const created = await createKnowledgeModuleItem({
        title,
        summary,
        genre: draftGenre === "すべて" ? "プラント" : draftGenre,
        tags,
        pdf_url: pdfUrl,
        medias,
      });

      setItems((prev) =>
        sortItems([dtoToItem(created), ...prev.filter((x) => x.id !== created.id)])
      );
      setDraftTitle("");
      setDraftBody("");
      setDraftTags([]);
      setDraftFiles([]);
      showToast(
        medias.length > 0 ? `添付${medias.length}件付きで追加しました` : "追加しました"
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }, [draftTitle, draftBody, draftGenre, draftTags, draftFiles, showToast]);

  const handleOpenEdit = useCallback((item: KnowledgeItem) => {
    setEditDraft({
      item,
      title: item.title,
      summary: item.summary,
      genre: item.genre as KnowledgeGenre,
      tags: [...item.tags],
      existingMedias: normalizeKnowledgeMediaAttachments(
        item as unknown as Record<string, unknown>
      ),
      newFiles: [],
    });
  }, []);

  const handleUpdate = useCallback(async () => {
    if (!editDraft) return;
    const title = editDraft.title.trim();
    const summary = editDraft.summary.trim();
    if (!title) {
      showToast("タイトルを入力してください");
      return;
    }
    if (
      !summary &&
      editDraft.existingMedias.length === 0 &&
      editDraft.newFiles.length === 0
    ) {
      showToast("メモを入力するか、ファイルを添付してください");
      return;
    }

    setSaving(true);
    try {
      const uploaded = await uploadKnowledgeModuleFiles(editDraft.newFiles);
      const medias: KnowledgeModuleMediaDto[] = [
        ...editDraft.existingMedias.map((media) => ({
          url: media.url,
          fileName: media.fileName,
          kind: media.kind,
        })),
        ...uploaded,
      ];
      const updated = await updateKnowledgeModuleItem(editDraft.item.id, {
        title,
        summary,
        genre: editDraft.genre,
        tags: editDraft.tags,
        pdf_url: medias[0]?.url ?? null,
        medias,
      });
      const nextItem = dtoToItem(updated);
      setItems((prev) =>
        sortItems(prev.map((item) => (item.id === nextItem.id ? nextItem : item)))
      );
      setDetailItem((current) => (current?.id === nextItem.id ? nextItem : current));
      setEditDraft(null);
      showToast("ナレッジを更新しました");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "更新に失敗しました");
    } finally {
      setSaving(false);
    }
  }, [editDraft, showToast]);

  return (
    <>
      <div className="kn-hero">
        <h1>現場ナレッジ</h1>
        <p>ジャンル · タグ · メディア添付 · すぐ追加</p>
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

      {loadError && !loading ? (
        <p className="kn-load-error" role="alert">
          読み込みエラー: {loadError}
          <button type="button" className="kn-retry-btn" onClick={() => void reloadItems()}>
            再読み込み
          </button>
        </p>
      ) : null}

      <KnowledgeCardList
        items={filtered}
        onOpen={setDetailItem}
        onEdit={handleOpenEdit}
      />

      <section className="kn-quick-add">
        <h2 className="kn-quick-add-title">かんたん登録</h2>
        <p className="kn-quick-add-hint">
          タイトル · メモ · タグ · PDF/写真/動画を添付して追加
        </p>
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
        <label className="kn-field-label">
          メディア・ファイル添付（PDF / 写真 / 動画）
        </label>
        <PdfUpload files={draftFiles} onChange={setDraftFiles} disabled={saving} />
        <button
          type="button"
          className="kn-add-btn"
          disabled={saving || !!loadError}
          onClick={() => void handleAdd()}
        >
          {saving ? "保存中…" : "＋ ナレッジを追加"}
        </button>
      </section>

      {detailItem ? (
        <KnowledgeDetailDialog
          item={detailItem}
          onClose={() => setDetailItem(null)}
          onEdit={() => handleOpenEdit(detailItem)}
        />
      ) : null}

      {editDraft ? (
        <KnowledgeEditDialog
          draft={editDraft}
          saving={saving}
          onChange={setEditDraft}
          onClose={() => setEditDraft(null)}
          onSave={() => void handleUpdate()}
        />
      ) : null}

      <Toast message={toast} />
    </>
  );
}

function KnowledgeDetailDialog({
  item,
  onClose,
  onEdit,
}: {
  item: KnowledgeItem;
  onClose: () => void;
  onEdit: () => void;
}) {
  const medias = normalizeKnowledgeMediaAttachments(
    item as unknown as Record<string, unknown>
  );
  return (
    <div className="kn-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="kn-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`${item.title} の詳細`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="kn-dialog-head">
          <h2>{item.title}</h2>
          <button type="button" className="kn-dialog-close" onClick={onClose}>
            ×
          </button>
        </div>
        <KnowledgeMediaGallery medias={medias} title={item.title} />
        <p className="kn-detail-summary">{item.summary || "メモはありません"}</p>
        {item.body ? (
          <div className="kn-detail-body">
            {item.body}
          </div>
        ) : null}
        <div className="kn-card-tags">
          {item.tags.map((tag) => (
            <span key={tag} className="kn-card-tag">
              #{tag}
            </span>
          ))}
        </div>
        <div className="kn-dialog-actions">
          <button type="button" className="kn-card-action" onClick={onClose}>
            閉じる
          </button>
          <button type="button" className="kn-add-btn" onClick={onEdit}>
            編集する
          </button>
        </div>
      </section>
    </div>
  );
}

function KnowledgeEditDialog({
  draft,
  saving,
  onChange,
  onClose,
  onSave,
}: {
  draft: KnowledgeEditDraft;
  saving: boolean;
  onChange: (draft: KnowledgeEditDraft) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const patchDraft = (patch: Partial<KnowledgeEditDraft>) =>
    onChange({ ...draft, ...patch });
  return (
    <div className="kn-dialog-backdrop" role="presentation">
      <section className="kn-dialog" role="dialog" aria-modal="true" aria-label="ナレッジ編集">
        <div className="kn-dialog-head">
          <h2>ナレッジ編集</h2>
          <button type="button" className="kn-dialog-close" onClick={onClose}>
            ×
          </button>
        </div>
        <label className="kn-field-label">タイトル</label>
        <input
          className="kn-field"
          value={draft.title}
          disabled={saving}
          onChange={(event) => patchDraft({ title: event.target.value })}
        />
        <label className="kn-field-label">メモ</label>
        <textarea
          className="kn-field kn-field-area"
          rows={4}
          value={draft.summary}
          disabled={saving}
          onChange={(event) => patchDraft({ summary: event.target.value })}
        />
        <label className="kn-field-label">ジャンル</label>
        <select
          className="kn-field"
          value={draft.genre}
          disabled={saving}
          onChange={(event) =>
            patchDraft({ genre: event.target.value as KnowledgeGenre })
          }
        >
          {KNOWLEDGE_GENRES.filter((genre) => genre !== "すべて").map((genre) => (
            <option key={genre} value={genre}>
              {genre}
            </option>
          ))}
        </select>
        <label className="kn-field-label">タグ</label>
        <TagInput
          tags={draft.tags}
          onChange={(tags) => patchDraft({ tags })}
          placeholder="タグ（例: IoT, 施工方法）"
        />
        <label className="kn-field-label">保存済み添付</label>
        <ExistingMediaEditor
          medias={draft.existingMedias}
          disabled={saving}
          onChange={(existingMedias) => patchDraft({ existingMedias })}
        />
        <label className="kn-field-label">追加ファイル</label>
        <PdfUpload
          files={draft.newFiles}
          onChange={(newFiles) => patchDraft({ newFiles })}
          disabled={saving}
        />
        <div className="kn-dialog-actions">
          <button type="button" className="kn-card-action" disabled={saving} onClick={onClose}>
            キャンセル
          </button>
          <button type="button" className="kn-add-btn" disabled={saving} onClick={onSave}>
            {saving ? "保存中…" : "変更を保存"}
          </button>
        </div>
      </section>
    </div>
  );
}

function ExistingMediaEditor({
  medias,
  disabled,
  onChange,
}: {
  medias: KnowledgeMediaAttachment[];
  disabled: boolean;
  onChange: (medias: KnowledgeMediaAttachment[]) => void;
}) {
  if (medias.length === 0) {
    return <p className="kn-attachment-empty">保存済み添付はありません</p>;
  }
  return (
    <div className="kn-attachment-grid">
      {medias.map((media, index) => (
        <div className="kn-attachment-item" key={`${media.url}:${index}`}>
          {media.kind === "image" ? (
            <img className="kn-media-thumb" src={media.url} alt="" loading="lazy" />
          ) : media.kind === "video" ? (
            <video
              className="kn-media-thumb kn-media-thumb-video"
              src={media.url}
              muted
              playsInline
              preload="metadata"
            />
          ) : (
            <span className="kn-pdf-icon" aria-hidden="true">
              {media.kind === "pdf" ? "📄" : "📎"}
            </span>
          )}
          <span className="kn-attachment-name">{media.fileName || media.url}</span>
          <button
            type="button"
            className="kn-attachment-remove"
            aria-label={`${media.fileName || "添付"} を削除`}
            disabled={disabled}
            onClick={() => onChange(medias.filter((_, mediaIndex) => mediaIndex !== index))}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

const mount = document.getElementById("kn-root");
if (mount) {
  createRoot(mount).render(<KnowledgeModulePage />);
}
