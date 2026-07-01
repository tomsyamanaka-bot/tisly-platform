/**
 * 現場図面イノベーション v1
 * 音声ピン / AI材料解析 / 教訓アラート
 */

/** プラント系キーワード → 教訓 */
const PLANT_LESSON_RULES = [
  {
    keys: ["コンベア", "ベルト", "conveyor", "belt"],
    title: "ベルトコンベアのゴムシート",
    body:
      "ゴムシート2枚重ねは硬すぎてモーターが回らなくなります。" +
      "布テープ補強を推奨！",
  },
  {
    keys: ["サイロ", "silo", "ホッパー"],
    title: "サイロ・ホッパー現場のコツ",
    body:
      "ペットボトル活用で低コストサイロが作れます。" +
      "残量検知は静電容量式センサーが有効です。",
  },
  {
    keys: ["プラント", "制御盤", "plc"],
    title: "プラント現場の基本",
    body:
      "異常時は全ステップリセット手順を" +
      "マニュアル化しておくと安心です。",
  },
];

/** 開いた直後に出す汎用教訓 */
const OPENING_LESSON = {
  title: "現場ファースト図面",
  body:
    "音声ピンで手袋のままメモ、" +
    "AI材料解析で見積候補へ直行できます。",
};

let alertHideTimer = null;
let activeRecognition = null;

/**
 * テキストから該当教訓を検索
 * @param {string} text
 */
export function matchPlantLessons(text) {
  const hay = String(text || "").toLowerCase();
  if (!hay.trim()) return [];
  return PLANT_LESSON_RULES.filter((rule) =>
    rule.keys.some((k) => hay.includes(k.toLowerCase()))
  );
}

/**
 * 画面上部に教訓アラートを表示
 * @param {{ title: string, body: string }} lesson
 * @param {{ $: (id: string) => HTMLElement|null, durationMs?: number }} opts
 */
export function showKnowledgeAlert(lesson, opts) {
  const mount = opts.$("drawing-knowledge-alert");
  if (!mount || !lesson) return;
  mount.innerHTML = `
    <div class="drawing-knowledge-alert-inner">
      <span class="drawing-knowledge-alert-icon" aria-hidden="true">💡</span>
      <div class="drawing-knowledge-alert-text">
        <strong>智紀社長の教訓：${escapeHtml(lesson.title)}</strong>
        <p>${escapeHtml(lesson.body)}</p>
      </div>
      <button type="button" class="drawing-knowledge-alert-close" aria-label="閉じる">×</button>
    </div>
  `;
  mount.classList.remove("hidden");
  mount.classList.add("visible");
  mount.querySelector(".drawing-knowledge-alert-close")?.addEventListener("click", () => {
    hideKnowledgeAlert(opts.$);
  });
  clearTimeout(alertHideTimer);
  const ms = opts.durationMs ?? 12000;
  alertHideTimer = setTimeout(() => hideKnowledgeAlert(opts.$), ms);
}

function hideKnowledgeAlert($) {
  const mount = $("drawing-knowledge-alert");
  if (!mount) return;
  mount.classList.remove("visible");
  mount.classList.add("hidden");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * 図面オープン時の教訓チェック
 * @param {{ sketch?: object, layers: object, $: Function }} ctx
 */
export function checkKnowledgeOnOpen(ctx) {
  const parts = [
    ctx.sketch?.title,
    ctx.sketch?.notes,
    ...(ctx.layers?.notes ?? []).map((n) => n.text),
    ...(ctx.layers?.symbols ?? []).map((s) => `${s.label} ${s.symbolType} ${s.memo}`),
  ];
  const joined = parts.filter(Boolean).join(" ");
  const hits = matchPlantLessons(joined);
  if (hits.length) {
    showKnowledgeAlert(hits[0], { $: ctx.$, durationMs: 14000 });
    return;
  }
  showKnowledgeAlert(OPENING_LESSON, { $: ctx.$, durationMs: 8000 });
}

/**
 * 記号選択・配置時の教訓チェック
 * @param {{ label?: string, symbolType?: string, memo?: string, $: Function }} ctx
 */
export function checkKnowledgeOnSymbol(ctx) {
  const text = [ctx.label, ctx.symbolType, ctx.memo].filter(Boolean).join(" ");
  const hits = matchPlantLessons(text);
  if (!hits.length) return;
  showKnowledgeAlert(hits[0], { $: ctx.$, durationMs: 14000 });
}

/**
 * Web Speech API で音声認識
 * @param {{ onResult: (text: string) => void, onError: (msg: string) => void, onStart?: () => void }} hooks
 */
export function startVoiceRecognition(hooks) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    hooks.onError("この端末は音声認識に未対応です");
    return null;
  }
  if (activeRecognition) {
    try {
      activeRecognition.abort();
    } catch {
      /* ignore */
    }
  }
  const rec = new SR();
  rec.lang = "ja-JP";
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  rec.onstart = () => hooks.onStart?.();
  rec.onresult = (ev) => {
    const text = ev.results?.[0]?.[0]?.transcript?.trim();
    if (text) hooks.onResult(text);
    else hooks.onError("音声を認識できませんでした");
    activeRecognition = null;
  };
  rec.onerror = (ev) => {
    hooks.onError(ev.error === "not-allowed" ? "マイク許可が必要です" : "音声認識エラー");
    activeRecognition = null;
  };
  rec.onend = () => {
    activeRecognition = null;
  };
  activeRecognition = rec;
  rec.start();
  return rec;
}

/**
 * 音声ピン用 — タップ位置で認識→メモ配置
 * @param {{ x: number, y: number, color: string, addNote: Function, setStatus: Function, $: Function }} ctx
 */
export function captureVoicePinAt(ctx) {
  const badge = ctx.$("drawing-voice-listening");
  badge?.classList.remove("hidden");
  ctx.setStatus("🎤 話してください…（例：ここ埋込2個口に変更）");

  const fallback = () => {
    badge?.classList.add("hidden");
    const text = window.prompt("音声未対応 — テキストを入力", "ここ埋込2個口に変更");
    if (text?.trim()) {
      ctx.addNote({
        text: text.trim(),
        x: ctx.x,
        y: ctx.y,
        color: ctx.color,
        voicePin: true,
      });
      ctx.setStatus("音声ピン（テキスト入力）を配置しました");
    } else {
      ctx.setStatus("音声ピンをキャンセルしました");
    }
  };

  const rec = startVoiceRecognition({
    onStart: () => ctx.setStatus("🎤 聞いています…"),
    onResult: (text) => {
      badge?.classList.add("hidden");
      ctx.addNote({
        text,
        x: ctx.x,
        y: ctx.y,
        color: ctx.color,
        voicePin: true,
      });
      ctx.setStatus(`音声ピン配置：${text.slice(0, 24)}${text.length > 24 ? "…" : ""}`);
    },
    onError: (msg) => {
      badge?.classList.add("hidden");
      ctx.setStatus(msg);
      if (msg.includes("未対応")) fallback();
    },
  });
  if (!rec) fallback();
}

/**
 * 写真・記号から簡易材料リストを生成（モック）
 * @param {{ layers: object, hasPhoto: boolean }} ctx
 */
export function analyzeMaterialsMock(ctx) {
  const sym = ctx.layers?.symbols ?? [];
  const outlet = sym.filter((s) => /outlet|コンセント/i.test(`${s.symbolType} ${s.label}`)).length;
  const light = sym.filter((s) => /light|照明/i.test(`${s.symbolType} ${s.label}`)).length;
  const camera = sym.filter((s) => /camera|カメラ/i.test(`${s.symbolType} ${s.label}`)).length;

  const paths = ctx.layers?.paths ?? [];
  let wireM = 30;
  for (const p of paths) {
    if (p.lineType && p.lineType !== "generic" && p.lengthPx) {
      wireM = Math.max(wireM, Math.round((p.lengthPx / 50) * 1.1));
    }
  }

  const items = [
    { id: "ai-outlet", label: "コンセント", qty: Math.max(outlet, 3), unit: "個", symbolType: "outlet" },
    { id: "ai-light", label: "照明", qty: Math.max(light, 2), unit: "台", symbolType: "light" },
    { id: "ai-wire", label: "通線（LAN/電源）", qty: wireM, unit: "m", symbolType: "lan_port" },
  ];
  if (camera > 0) {
    items.push({
      id: "ai-camera",
      label: "防犯カメラ",
      qty: camera,
      unit: "台",
      symbolType: "dome_camera",
    });
  }
  if (!ctx.hasPhoto && sym.length === 0) {
    items.push({
      id: "ai-misc",
      label: "配線ダクト",
      qty: 2,
      unit: "本",
      symbolType: "junction",
    });
  }
  return items;
}

/**
 * 材料候補を見積プレビュー形式へ変換
 * @param {Array<{ id: string, label: string, qty: number, unit: string, symbolType: string }>} items
 */
export function materialItemsToPreviewCandidates(items) {
  return (items ?? []).map((it) => ({
    sourceType: "symbol",
    sourceId: it.id,
    symbolType: it.symbolType,
    label: it.label,
    qty: it.qty,
    unit: it.unit,
    workItem: null,
    material: null,
    mappingId: null,
    memo: "AI材料解析（図面）",
  }));
}

/**
 * 材料リスト UI を描画
 * @param {{ items: object[], $: Function, onReady?: (items: object[]) => void }} ctx
 */
export function renderMaterialListPanel(ctx) {
  const panel = ctx.$("drawing-ai-material-list");
  const bar = ctx.$("drawing-ai-material-bar");
  if (!panel) return;
  bar?.classList.remove("hidden");
  panel.classList.remove("hidden");
  panel.classList.add("visible");
  panel.innerHTML = `
    <div class="drawing-ai-material-header">🤖 AI材料解析結果</div>
    <ul class="drawing-ai-material-items">
      ${ctx.items
        .map(
          (it) =>
            `<li><span class="mat-label">${escapeHtml(it.label)}</span>` +
            `<span class="mat-qty">×${it.qty}${escapeHtml(it.unit)}</span></li>`
        )
        .join("")}
    </ul>
    <p class="drawing-ai-material-hint">「見積候補を作成」で引き渡せます</p>
  `;
  ctx.onReady?.(ctx.items);
}

/**
 * 背景写真の有無で材料バー表示切替
 * @param {{ hasPhoto: boolean, $: Function }} ctx
 */
export function updateMaterialBarVisibility(ctx) {
  const bar = ctx.$("drawing-ai-material-bar");
  if (!bar) return;
  bar.classList.toggle("hidden", !ctx.hasPhoto);
}

/**
 * 図面イノベーション UI を初期化
 * @param {object} opts
 */
export function initDrawingFieldInnovationsV1(opts) {
  const { $, getLayers, getHasPhoto, setAiMaterialCandidates, setStatus } = opts;

  $("btn-ai-material")?.addEventListener("click", () => {
    if (!getHasPhoto()) {
      setStatus("写真を読み込んでから AI材料解析してください");
      return;
    }
    setStatus("AI材料解析中…");
    const items = analyzeMaterialsMock({
      layers: getLayers(),
      hasPhoto: getHasPhoto(),
    });
    setTimeout(() => {
      renderMaterialListPanel({
        items,
        $,
        onReady: (list) => {
          setAiMaterialCandidates(list);
          setStatus(`材料 ${list.length} 件をリストアップしました`);
        },
      });
    }, 420);
  });

  return {
    checkKnowledgeOnOpen: (sketch) => checkKnowledgeOnOpen({ sketch, layers: getLayers(), $ }),
    checkKnowledgeOnSymbol: (sym) => checkKnowledgeOnSymbol({ ...sym, $ }),
    captureVoicePinAt: (pt) =>
      captureVoicePinAt({
        ...pt,
        $,
        addNote: opts.addNote,
        setStatus,
      }),
  };
}
