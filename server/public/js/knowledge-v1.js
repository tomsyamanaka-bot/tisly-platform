/**
 * Knowledge v1 — ナレッジ検索 PWA
 * モックデータ + キーワードフィルタ
 * （将来 /api/knowledge/search-v1 へ差替可能）
 */

const QUICK_TAGS = ["#IoT", "#施工方法", "#プラント", "#電気", "#防犯", "#配管"];

/** モックナレッジカード */
const MOCK_ARTICLES = [
  {
    id: "kn-silo-cola",
    icon: "🏗️",
    title: "コーラ瓶サイロの作り方",
    category: "プラント施工",
    tags: ["#プラント", "#施工方法", "#配管"],
    summary: "200Lドラムをベースにしたデモ用サイロの組立手順。",
    detail: `
      <p>工場ラインのデモ用に、コーラ瓶を供給する小型サイロを現場で組み立てる手順です。</p>
      <h3>必要部材</h3>
      <p>200Lドラム · PVCパイプ100A · 蝶番 · 透明アクリル窓 · 振動モーター（任意）</p>
      <h3>手順</h3>
      <p>1. ドラム上部に投入口をカット<br>2. 下部に45°エルボで排出口を設置<br>3. レベルセンサー取付穴をφ20で開ける<br>4. 試験投入で詰まりがないか確認</p>
      <h3>注意点</h3>
      <p>本番サイロとは異なります。耐圧・食品衛生の要件は別途確認してください。</p>
    `,
  },
  {
    id: "kn-megger-trap",
    icon: "⚡",
    title: "メガー0MΩトラップ",
    category: "電気トラブル",
    tags: ["#電気", "#IoT", "#施工方法"],
    summary: "メガー試験で0MΩになる典型原因と切り分け。",
    detail: `
      <p>現場で「メガーが0MΩ」と言われたとき、すぐ断線と決めつけないためのチェックリストです。</p>
      <h3>よくある原因</h3>
      <p>・結露による漏電（エアコン配管付近）<br>・未使用芯線のシース破損<br>・盤内のサージサプレッサ焼損<br>・モーター巻線焼損</p>
      <h3>切り分け</h3>
      <p>1. 負荷側ブレーカを全 OFF<br>2. 配線を区間分割して再測定<br>3. 0MΩ区間を特定後、目視 + 乾燥</p>
      <h3>記録</h3>
      <p>測定値 · 天候 · 結露有無を写真付きで残すと再発防止に有効です。</p>
    `,
  },
  {
    id: "kn-ac-condense",
    icon: "💧",
    title: "エアコン裏結露対策",
    category: "現場メンテ",
    tags: ["#施工方法", "#電気", "#IoT"],
    summary: "室外機裏の結露・カビ・漏電リスクを下げる施工ポイント。",
    detail: `
      <p>エアコン室外機の壁際設置で起きやすい結露問題への対策まとめです。</p>
      <h3>症状</h3>
      <p>壁紙のシミ · 配管カバー内の水滴 · メガー値低下 · カビ臭</p>
      <h3>対策</h3>
      <p>1. 室外機を壁から100mm以上離す<br>2. ドレン勾配 1/50 以上を確保<br>3. 配管保温の端部をテープで完全密封<br>4. 必要なら結露防止ヒーター（伴熱）を検討</p>
      <h3>IoT連携</h3>
      <p>温湿度センサーで「湿度80%超 × 壁温低下」をアラートにすると予防保全できます。</p>
    `,
  },
];

let activeTag = "";
let query = "";

const $ = (id) => document.getElementById(id);

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 検索クエリ + タグでフィルタ */
function filterArticles() {
  const q = query.trim().toLowerCase();
  const tag = activeTag.replace(/^#/, "").toLowerCase();

  return MOCK_ARTICLES.filter((a) => {
    const hay = [a.title, a.summary, a.category, ...(a.tags || [])].join(" ").toLowerCase();
    const matchQ = !q || hay.includes(q);
    const matchTag = !tag || hay.includes(tag) || (a.tags || []).some((t) => t.toLowerCase().includes(tag));
    return matchQ && matchTag;
  });
}

function renderTags() {
  const row = $("tag-row");
  if (!row) return;

  row.innerHTML = QUICK_TAGS.map(
    (t) =>
      `<button type="button" class="kn-tag ${activeTag === t ? "active" : ""}" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`
  ).join("");

  row.querySelectorAll(".kn-tag").forEach((btn) => {
    btn.addEventListener("click", () => {
      const t = btn.dataset.tag || "";
      activeTag = activeTag === t ? "" : t;
      renderTags();
      renderResults();
    });
  });
}

function renderResults() {
  const el = $("results");
  if (!el) return;

  const hits = filterArticles();

  if (!hits.length) {
    el.innerHTML = '<p class="kn-empty">該当するナレッジがありません</p>';
    return;
  }

  el.innerHTML = hits
    .map(
      (a) => `
    <article class="kn-card" data-id="${escapeHtml(a.id)}" tabindex="0">
      <div class="kn-card-icon">${a.icon}</div>
      <h2>${escapeHtml(a.title)}</h2>
      <p class="kn-card-meta">${escapeHtml(a.category)}</p>
      <div class="kn-card-tags">${(a.tags || []).map((t) => `<span>${escapeHtml(t)}</span>`).join("")}</div>
    </article>`
    )
    .join("");

  el.querySelectorAll(".kn-card").forEach((card) => {
    const open = () => {
      const id = card.dataset.id;
      const article = MOCK_ARTICLES.find((x) => x.id === id);
      if (article) openModal(article);
    };
    card.addEventListener("click", open);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });
  });
}

function openModal(article) {
  const backdrop = $("modal-backdrop");
  const title = $("modal-title");
  const body = $("modal-body");
  if (!backdrop || !title || !body) return;

  title.textContent = article.title;
  body.innerHTML = article.detail;
  backdrop.classList.add("open");
  backdrop.setAttribute("aria-hidden", "false");
}

function closeModal() {
  const backdrop = $("modal-backdrop");
  if (!backdrop) return;
  backdrop.classList.remove("open");
  backdrop.setAttribute("aria-hidden", "true");
}

/** Web Speech API（非対応時はトースト） */
function initMic() {
  const btn = $("mic-btn");
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!btn) return;

  if (!SpeechRecognition) {
    btn.addEventListener("click", () => {
      $("search-input")?.focus();
    });
    return;
  }

  const rec = new SpeechRecognition();
  rec.lang = "ja-JP";
  rec.interimResults = false;
  rec.maxAlternatives = 1;

  rec.onstart = () => btn.classList.add("listening");
  rec.onend = () => btn.classList.remove("listening");
  rec.onerror = () => btn.classList.remove("listening");

  rec.onresult = (ev) => {
    const text = ev.results?.[0]?.[0]?.transcript ?? "";
    const input = $("search-input");
    if (input && text) {
      input.value = text;
      query = text;
      renderResults();
    }
  };

  btn.addEventListener("click", () => {
    try {
      rec.start();
    } catch {
      rec.stop();
    }
  });
}

function initSearch() {
  const input = $("search-input");
  input?.addEventListener("input", () => {
    query = input.value;
    renderResults();
  });
  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      renderResults();
    }
  });
}

function initModal() {
  $("modal-close")?.addEventListener("click", closeModal);
  $("modal-backdrop")?.addEventListener("click", (e) => {
    if (e.target.id === "modal-backdrop") closeModal();
  });
}

function init() {
  renderTags();
  renderResults();
  initSearch();
  initMic();
  initModal();
}

init();
