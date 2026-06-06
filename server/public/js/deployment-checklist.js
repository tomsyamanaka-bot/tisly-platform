/**
 * Phase 2041–2080 — 本番公開チェックリスト (/deployment/checklist)
 */

const PRODUCTION_URLS = [
  { path: "/app", label: "App Hub" },
  { path: "/survey", label: "現調 PWA" },
  { path: "/business", label: "TOMS Business" },
  { path: "/sales", label: "営業デモ" },
  { path: "/customer/TOMS001", label: "顧客ポータル" },
  { path: "/customer/TOMS001/pro-remote", label: "PRO Remote" },
  { path: "/customer/TOMS001/install/home", label: "施工 PWA" },
  { path: "/tv/TOMS001", label: "Google TV Web" },
  { path: "/deployment/checklist", label: "本チェックリスト" },
];

const INTEGRATION_SERVICES = ["Gmail", "QNAP", "MQTT", "Shelly"];

const IPHONE_CHECKS = [
  { id: "iphone-survey-open", label: "Safari で /survey を開く", detail: "https://tisly.jp/survey が HTTPS で表示される" },
  { id: "iphone-survey-add", label: "共有 → ホーム画面に追加", detail: "PWA として追加できる" },
  { id: "iphone-survey-standalone", label: "standalone 起動", detail: "アドレスバーなしで起動できる" },
  { id: "iphone-survey-offline", label: "オフライン表示", detail: "機内モードでもシェルが表示される（任意）" },
];

const ANDROID_CHECKS = [
  { id: "android-app-open", label: "Chrome で /app を開く", detail: "https://tisly.jp/app · VPS Deploy Status 表示" },
  { id: "android-app-install", label: "ホーム画面に追加 / インストール", detail: "PWA インストールバナーまたはメニューから追加" },
  { id: "android-app-standalone", label: "standalone 起動", detail: "追加後にアプリアイコンから起動" },
  { id: "android-checklist-card", label: "本番公開チェックカード", detail: "Production Readiness が表示される" },
];

const GOOGLE_TV_CHECKS = [
  { id: "gtv-open", label: "TV ブラウザで /tv/TOMS001 を開く", detail: "https://tisly.jp/tv/TOMS001 · フルスクリーン表示" },
  { id: "gtv-focus", label: "フォーカス / リモコン操作", detail: "カメラ切替・フロア表示が操作できる" },
  { id: "gtv-ws", label: "リアルタイム更新", detail: "WebSocket 切断なくデモが動く（mock 可）" },
  { id: "gtv-checklist", label: "本チェックリストで Google TV にチェック", detail: "上記確認後にチェックを入れる" },
];

const PWA_ICON_MANUAL_CHECKS = [
  { id: "pwa-icon-safari-reinstall", label: "Safari再追加手順 OK", detail: "削除 → https://tisly.jp/app → 共有 → ホーム画面に追加 → 六角シールド確認" },
];

const STORAGE_KEY = "tisly_deploy_checklist_manual";
let lastCheckState = { urlResults: [], gate: null, audit: null, preflight: null, rehearsal: null };
let cachedVpsCommands = [];
let cachedProductionStart = null;
let cachedProductionLaunch = null;
let cachedProductionVerification = null;
let cachedPwaIconCheck = null;

function loadManualChecks() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveManualCheck(id, checked) {
  const data = loadManualChecks();
  data[id] = checked;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function statusBadge(status) {
  const map = {
    pass: "合格",
    warn: "注意",
    fail: "未達",
    ok: "合格",
    missing: "不足",
    pending: "確認中",
    mock: "mock",
    real: "real",
    unknown: "不明",
    ready: "READY",
    not_ready: "NOT READY",
    set: "SET",
    not_set: "NOT SET",
    deployed: "DEPLOYED",
    not_deployed: "NOT DEPLOYED",
    checked: "READY",
    not_checked: "NOT CHECKED",
    required: "required",
    optional: "optional",
  };
  return `<span class="badge ${status}">${map[status] || status}</span>`;
}

function renderCard(label, status, message) {
  return `<div class="card ${status}">
    <div class="card-head">
      <span class="card-label">${label}</span>
      ${statusBadge(status)}
    </div>
    <div class="card-msg">${message}</div>
  </div>`;
}

function renderRehearsalGrid(rehearsal) {
  const grid = document.getElementById("rehearsal-grid");
  if (!rehearsal?.statusRows?.length) {
    grid.innerHTML = renderCard("Rehearsal", "warn", "rehearsal-checklist 未取得");
    return;
  }
  grid.innerHTML = rehearsal.statusRows
    .map(
      (row) => `<div class="rehearsal-card ${row.status}">
        <div class="rehearsal-label">${row.displayLabel}</div>
        <div class="rehearsal-msg">${row.message}</div>
      </div>`
    )
    .join("");
}

function renderEnvTable(rehearsal) {
  const wrap = document.getElementById("env-table-wrap");
  if (!rehearsal?.envChecklist?.length) {
    wrap.innerHTML = "<p class='meta'>env チェック表未取得</p>";
    return;
  }
  const rows = rehearsal.envChecklist
    .map(
      (r) => `<tr>
        <td><code>${r.label}</code></td>
        <td>${statusBadge(r.requirement)}</td>
        <td>${statusBadge(r.state)}</td>
        <td class="meta">${r.message}</td>
      </tr>`
    )
    .join("");
  wrap.innerHTML = `<table class="env-table">
    <thead><tr><th>変数</th><th>区分</th><th>状態</th><th>備考</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderVpsCommandModal(steps) {
  const container = document.getElementById("vps-cmd-steps");
  if (!steps?.length) {
    container.innerHTML = "<p class='meta'>コマンド未取得</p>";
    return;
  }
  container.innerHTML = steps
    .map(
      (step, i) => `<div class="cmd-step">
        <h4>${i + 1}. ${step.title}</h4>
        <div class="cmd-block">${step.commands.join("\n")}</div>
        ${step.note ? `<div class="cmd-note">${step.note}</div>` : ""}
      </div>`
    )
    .join("");
}

function openVpsModal(mode = "deploy") {
  const modal = document.getElementById("vps-modal");
  const title = document.getElementById("vps-modal-title");
  if (mode === "env_prep" && cachedProductionLaunch?.envPrepBlock?.length) {
    title.textContent = ".env 準備コマンド（openssl · hashPassword · プレースホルダのみ）";
    renderVpsCommandModal([
      {
        title: "VNC コンソール — .env 準備（秘密生成）",
        commands: cachedProductionLaunch.envPrepBlock,
        note: "✋ openssl 出力と hashPassword 出力を nano .env に貼り付け。docs/vps_phase1841_launch.md 参照",
      },
      {
        title: ".env 入力例（実値なし）",
        commands: (cachedProductionLaunch.sectionC_envExample || "").split("\n"),
        note: "プレースホルダを実値に置き換えてください",
      },
    ]);
  } else if (mode === "production_verify" && cachedProductionLaunch?.verifyBlock?.length) {
    title.textContent = "起動後確認コマンド";
    renderVpsCommandModal([
      {
        title: "systemd · nginx · health 確認",
        commands: cachedProductionLaunch.verifyBlock,
        note: "すべて OK なら https://tisly.jp/app をブラウザで開く",
      },
      ...(cachedProductionLaunch.failureBranches?.length
        ? [
            {
              title: "失敗時の分岐（症状 → 確認 → 対処）",
              commands: cachedProductionLaunch.failureBranches.map(
                (b) => `# ${b.symptom}\n# 確認: ${b.checkCommands.join(" · ")}\n# 対処: ${b.fix}`
              ),
              note: "詳細 docs/vps_phase1921_launch.md § C",
            },
          ]
        : []),
    ]);
  } else if (mode === "checklist_verify" && cachedProductionVerification?.checklistStatusVerifyBlock?.length) {
    title.textContent = "VPS DEPLOYED · SSL READY · PWA installReady 確認";
    renderVpsCommandModal([
      {
        title: "Rehearsal API で vps / ssl / pwa 行を確認",
        commands: cachedProductionVerification.checklistStatusVerifyBlock,
        note: "ブラウザでは本ページの Rehearsal グリッドで 3 行が緑であること",
      },
      {
        title: "9 URL 一括スモーク",
        commands: cachedProductionVerification.browserTestUrls
          ? [
              "BASE=https://tisly.jp",
              ...cachedProductionVerification.browserTestUrls.map(
                (u) => `# ${u.priority}. ${u.label} → ${u.path}`
              ),
            ]
          : ["docs/vps_phase1921_launch.md § C-3 参照"],
        note: "docs/vps_phase1921_launch.md",
      },
    ]);
  } else if (mode === "production_start" && cachedProductionStart?.oneBlock?.length) {
    title.textContent = "本番起動コマンド（.env 完了後 · systemd）";
    renderVpsCommandModal([
      {
        title: "VNC コンソールへ貼り付け（1 ブロック）",
        commands: cachedProductionStart.oneBlock,
        note: cachedProductionStart.note || cachedProductionStart.methodLabel,
      },
    ]);
  } else if (mode === "pwa_icon_deploy" && cachedPwaIconCheck?.curlVerifyBlock?.length) {
    title.textContent = "PWA アイコン本番反映（git pull → build → restart）";
    renderVpsCommandModal([
      {
        title: "VPS 反映（智紀さんが実行）",
        commands: [
          "cd /opt/tisly",
          "git pull origin master",
          "cd server",
          "npm ci",
          "npm run build",
          "systemctl restart tisly-server",
        ],
        note: "docs/vps_phase2041_launch.md 参照",
      },
      {
        title: "curl 確認（新アイコン配信）",
        commands: cachedPwaIconCheck.curlVerifyBlock,
        note: `期待: icon-192 / apple-touch-icon が HTTP 200 · manifest icons に ?v=${cachedPwaIconCheck.iconVersion || "2001"}`,
      },
    ]);
  } else if (cachedVpsCommands.length) {
    title.textContent = "VPS 投入コマンド（プレースホルダのみ）";
    renderVpsCommandModal(cachedVpsCommands);
  }
  modal.classList.add("open");
}

function closeVpsModal() {
  document.getElementById("vps-modal").classList.remove("open");
}

async function probeUrl(path) {
  const url = `${window.location.origin}${path}`;
  try {
    const res = await fetch(url, { method: "GET", cache: "no-store" });
    return { url, status: res.ok ? "pass" : "fail", code: res.status };
  } catch (e) {
    return { url, status: "fail", code: 0, error: String(e.message || e) };
  }
}

async function probeAsset(path) {
  const url = `${window.location.origin}${path}`;
  try {
    const res = await fetch(url, { method: "GET", cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

function renderDeviceChecks(containerId, items) {
  const manual = loadManualChecks();
  const ul = document.getElementById(containerId);
  ul.innerHTML = "";
  for (const item of items) {
    const li = document.createElement("li");
    if (manual[item.id]) li.classList.add("done");
    const checked = !!manual[item.id];
    li.innerHTML = `
      <label>
        <input type="checkbox" data-id="${item.id}" ${checked ? "checked" : ""} />
        <span><strong>${item.label}</strong><small>${item.detail}</small></span>
      </label>`;
    li.querySelector("input").addEventListener("change", (e) => {
      saveManualCheck(item.id, e.target.checked);
      renderDeviceChecks(containerId, items);
      updateVerdict(
        lastCheckState.urlResults,
        lastCheckState.gate,
        lastCheckState.audit,
        lastCheckState.preflight,
        lastCheckState.rehearsal
      );
    });
    ul.appendChild(li);
  }
}

function allManualDone() {
  const manual = loadManualChecks();
  return [...IPHONE_CHECKS, ...ANDROID_CHECKS, ...GOOGLE_TV_CHECKS, ...PWA_ICON_MANUAL_CHECKS].every(
    (c) => manual[c.id]
  );
}

function renderIphoneReinstallSteps(steps) {
  const ol = document.getElementById("iphone-reinstall-steps");
  if (!steps?.length) {
    ol.innerHTML = "<li class='meta'>手順未取得</li>";
    return;
  }
  ol.innerHTML = steps.map((s) => `<li>${s}</li>`).join("");
}

async function renderPwaIconSection(iconCheck) {
  const grid = document.getElementById("pwa-icon-grid");
  if (!iconCheck) {
    grid.innerHTML = renderCard("PWAアイコン", "warn", "pwa-icon-check 未取得");
    return;
  }

  const probeResults = await Promise.all(
    (iconCheck.checks || []).map(async (c) => {
      const ok = await probeAsset(c.url);
      return { ...c, liveOk: ok };
    })
  );

  let html = probeResults
    .map((c) => {
      const status = c.liveOk && c.ok ? "pass" : "fail";
      const msg = `${c.url} · file=${c.ok ? "yes" : "no"} · HTTP=${c.liveOk ? "200" : "fail"}`;
      return renderCard(c.label, status, msg);
    })
    .join("");

  html += renderCard(
    "manifest icons v=" + (iconCheck.iconVersion || "2001"),
    iconCheck.manifestIconsVersioned && iconCheck.manifestNoOldIconUrls ? "pass" : "fail",
    iconCheck.manifestIconsVersioned && iconCheck.manifestNoOldIconUrls
      ? "全 manifest が新アイコン URL（?v=）のみ参照"
      : "旧アイコン URL またはバージョン不一致あり"
  );

  html += renderCard(
    "apple-touch-icon",
    iconCheck.appleTouchIconExists ? "pass" : "fail",
    iconCheck.appleTouchIconExists ? "/apple-touch-icon.png 存在" : "apple-touch-icon.png 未配置"
  );

  html += renderCard(
    "app-hub apple-touch-icon",
    iconCheck.appHubHasAppleTouchIcon ? "pass" : "fail",
    iconCheck.appHubHasAppleTouchIcon ? "app-hub.html に apple-touch-icon リンクあり" : "リンクなし"
  );

  const allAuto =
    iconCheck.ready && probeResults.every((c) => c.liveOk && c.ok);
  html += renderCard(
    "PWAアイコン本番確認 合計",
    allAuto ? "pass" : "warn",
    allAuto ? "自動チェック合格 — Safari 再追加手順を実機で確認" : "未達項目あり — VPS 反映またはキャッシュ消去"
  );

  grid.innerHTML = html;
}

function updateVerdict(urlResults, gate, audit, preflight, rehearsal) {
  const verdict = document.getElementById("verdict");
  const urlFails = (urlResults || []).filter((r) => r.status !== "pass").length;
  const gateReady = gate?.vpsDeployStatus?.ready === true;
  const auditReady = audit?.ready === true;
  const preflightReady = preflight?.ready === true;
  const manualDone = allManualDone();
  const httpsOk = gate?.tislyPublicUrl?.startsWith("https://tisly.jp");
  const releasePass = gate?.releaseGate?.status === "pass" || gate?.passed === true;
  const rehearsalReady = rehearsal?.rehearsalReady === true;

  const autoOk = urlFails === 0 && gateReady && httpsOk && releasePass;
  const fullyReady = autoOk && auditReady && preflightReady && manualDone && rehearsalReady;

  if (fullyReady) {
    verdict.className = "verdict pass";
    verdict.innerHTML = `本番公開チェック完了<span class="verdict-big">READY</span>`;
  } else if (urlFails > 0 || !gateReady || !httpsOk || !rehearsalReady) {
    verdict.className = "verdict fail";
    const parts = [];
    if (urlFails > 0) parts.push(`URL ${urlFails} 件未達`);
    if (!rehearsalReady) parts.push("Rehearsal 未合格");
    if (!gateReady) parts.push("Release Gate 未合格");
    if (!httpsOk) parts.push("HTTPS / TISLY_PUBLIC_URL");
    verdict.innerHTML = `${parts.join(" · ")}<span class="verdict-big">NOT READY</span>`;
  } else {
    verdict.className = "verdict pending";
    const hint = manualDone
      ? "自動チェック OK — preflight / audit の警告を確認"
      : "自動チェック OK — iPhone / Android / Google TV の手動確認が残っています";
    verdict.innerHTML = `${hint}<span class="verdict-big">READY（手動確認残）</span>`;
  }
}

function resolveIntegrationMode(service, preflight, mockReal) {
  const catMap = { Gmail: "GMAIL", QNAP: "QNAP", MQTT: "MQTT", Shelly: "SHELLY" };
  const cat = preflight?.categories?.find((c) => c.id === catMap[service]);
  if (cat?.message) {
    const m = cat.message.match(/=(mock|real)/i);
    if (m) return m[1].toLowerCase();
  }
  const entry = (mockReal || []).find((m) => {
    const s = (m.service || "").toLowerCase();
    return s.includes(service.toLowerCase());
  });
  return entry?.mode || "unknown";
}

function renderMockReal(gate, preflight) {
  const grid = document.getElementById("mock-real-grid");
  const mockReal = gate?.pwaAudit?.mockReal || [];
  const chips = INTEGRATION_SERVICES.map((svc) => {
    const mode = resolveIntegrationMode(svc, preflight, mockReal);
    const cls = mode === "real" ? "real" : mode === "mock" ? "mock" : "unknown";
    return `<span class="mock-chip ${cls}">${svc}: ${mode}</span>`;
  }).join("");

  const demoSafe = mockReal.every((m) => m.mode !== "real" || m.demoSafe);
  const cards = INTEGRATION_SERVICES.map((svc) => {
    const mode = resolveIntegrationMode(svc, preflight, mockReal);
    const status = mode === "mock" ? "pass" : mode === "real" ? "warn" : "warn";
    const msg =
      mode === "mock"
        ? `${svc} は mock — 初回公開安全`
        : mode === "real"
          ? `${svc} は real — 本番データに接続中`
          : `${svc} モード不明 — .env を確認`;
    return renderCard(svc, status, msg);
  });

  grid.innerHTML =
    renderCard(
      "初回公開推奨",
      demoSafe ? "pass" : "warn",
      demoSafe ? "主要連携は mock または安全設定" : "real 連携が有効 — mock 推奨か確認"
    ) +
    `<div class="card pass"><div class="card-label">連携一覧</div><div class="mock-grid">${chips}</div></div>` +
    cards.join("");
}

function renderPwaSection(gate, swOk) {
  const pwaGrid = document.getElementById("pwa-grid");
  const pwaAudit = gate?.pwaInstallAudit;
  const pwAs = gate?.pwaAudit?.pwAs || [];
  let html = "";

  if (pwaAudit?.entries) {
    html += pwaAudit.entries
      .map((e) => {
        const manifestOk = e.checks?.some((c) => c.id === "manifest" && c.ok) ?? !!e.manifestFile;
        const swCheck = e.checks?.find((c) => c.id === "service_worker" || c.id === "sw");
        const swLine = swCheck ? (swCheck.ok ? "SW OK" : "SW 要確認") : "SW 監査";
        return renderCard(
          e.label || e.route,
          e.installReady ? "pass" : "fail",
          `installReady: ${e.installReady ? "yes" : "no"} · manifest: ${e.manifestFile || "—"} · ${swLine}`
        );
      })
      .join("");
    html += renderCard(
      "PWA 合計",
      pwaAudit.readyCount === pwaAudit.totalPwa ? "pass" : "warn",
      `${pwaAudit.readyCount}/${pwaAudit.totalPwa} installReady`
    );
  }

  const mainPwa = pwAs.filter((p) => p.isPwa);
  if (mainPwa.length > 0) {
    html += mainPwa
      .map((p) =>
        renderCard(
          `${p.pwaName} — manifest / SW`,
          p.installReady && p.manifestUrl ? "pass" : "warn",
          `manifest: ${p.manifestUrl || "—"} · SW: ${p.serviceWorker || "—"} · scope: ${p.scope || "—"}`
        )
      )
      .join("");
  }

  html += renderCard(
    "Service Worker（/service-worker.js）",
    swOk ? "pass" : "fail",
    swOk ? "200 OK — ルート SW 取得可能" : "取得失敗 — nginx / ビルドを確認"
  );

  pwaGrid.innerHTML = html || renderCard("PWA installReady", "warn", "pwaInstallAudit 未取得");
}

async function loadAll() {
  const btn = document.getElementById("refresh-btn");
  btn.disabled = true;

  const [health, gate, audit, preflight, rehearsal, swOk, iconCheck] = await Promise.all([
    fetch("/api/health").then((r) => r.json()).catch(() => ({ ok: false })),
    fetch("/api/deploy/release-gate").then((r) => r.json()).catch(() => null),
    fetch("/api/deploy/audit").then((r) => r.json()).catch(() => null),
    fetch("/api/deploy/preflight").then((r) => r.json()).catch(() => null),
    fetch("/api/deploy/rehearsal-checklist").then((r) => r.json()).catch(() => null),
    probeAsset("/service-worker.js"),
    fetch("/api/deploy/pwa-icon-check").then((r) => r.json()).catch(() => null),
  ]);

  cachedPwaIconCheck = iconCheck;

  cachedVpsCommands = rehearsal?.vpsCommands || [];
  cachedProductionStart = rehearsal?.productionStart || null;
  cachedProductionLaunch = rehearsal?.productionLaunch || null;
  cachedProductionVerification = rehearsal?.productionVerification || null;
  renderRehearsalGrid(rehearsal);
  renderEnvTable(rehearsal);

  const urlResults = await Promise.all(PRODUCTION_URLS.map((u) => probeUrl(u.path)));
  const urlList = document.getElementById("url-list");
  urlList.innerHTML = urlResults
    .map((r, i) => {
      const label = PRODUCTION_URLS[i].label;
      const st = r.status;
      return `<li class="${st}">
        <div><strong>${label}</strong><br><a href="${r.url}" target="_blank" rel="noopener">${r.url}</a></div>
        ${statusBadge(st)} <span class="meta">HTTP ${r.code || "—"}</span>
      </li>`;
    })
    .join("");

  const apiGrid = document.getElementById("api-grid");
  const gateItems = gate?.vpsDeployStatus?.items || [];
  const readiness = gate?.productionReadiness;
  apiGrid.innerHTML = [
    renderCard(
      "API Health",
      health.ok ? "pass" : "fail",
      health.ok ? `ok · uptime ${health.uptimeSec ?? "—"}s` : "GET /api/health 失敗"
    ),
    renderCard(
      "Preflight (.env)",
      preflight?.ready ? "pass" : preflight ? "fail" : "warn",
      preflight?.ready
        ? "ready — 不足なし"
        : preflight?.missing?.length
          ? `不足: ${preflight.missing.slice(0, 5).join(", ")}${preflight.missing.length > 5 ? "…" : ""}`
          : "preflight 未取得"
    ),
    renderCard(
      "Release Gate",
      gate?.releaseGate?.status === "pass" || gate?.passed ? "pass" : gate?.releaseGate ? "fail" : "warn",
      gate?.releaseGate?.message || gate?.vpsDeployStatus?.readyLabel || "—"
    ),
    renderCard(
      "Production Readiness",
      readiness?.publishable ? "pass" : "warn",
      readiness?.publishableLabel || "—"
    ),
    renderCard(
      "Rehearsal",
      rehearsal?.rehearsalReady ? "pass" : rehearsal ? "fail" : "warn",
      rehearsal?.rehearsalReadyLabel || "—"
    ),
    ...gateItems.slice(0, 3).map((i) => renderCard(i.label, i.status, i.message)),
  ].join("");

  const infraGrid = document.getElementById("infra-grid");
  const auditItems = audit?.items || [];
  const nginx = auditItems.find((i) => i.id === "nginx");
  const systemd = auditItems.find((i) => i.id === "systemd");
  const wss = auditItems.find((i) => i.id === "wss" || i.id === "websocket");
  const httpsItem = auditItems.find((i) => i.id === "https");
  const httpsFromGate = gate?.tislyPublicUrl?.startsWith("https://tisly.jp");
  infraGrid.innerHTML = [
    renderCard(
      "HTTPS",
      httpsFromGate && httpsItem?.status !== "fail" ? "pass" : "fail",
      gate?.tislyPublicUrl || httpsItem?.message || "TISLY_PUBLIC_URL 未設定"
    ),
    wss
      ? renderCard("WebSocket /ws", wss.status, wss.message)
      : renderCard("WebSocket /ws", gateItems.find((i) => i.id === "websocket")?.status || "warn", "監査または gate で確認"),
    nginx ? renderCard("nginx 想定", nginx.status, nginx.message) : renderCard("nginx", "warn", "監査未取得"),
    systemd ? renderCard("systemd 想定", systemd.status, systemd.message) : renderCard("systemd", "warn", "監査未取得"),
  ].join("");

  renderMockReal(gate, preflight);
  renderPwaSection(gate, swOk);
  renderIphoneReinstallSteps(iconCheck?.safariReinstallSteps);
  await renderPwaIconSection(iconCheck);

  lastCheckState = { urlResults, gate, audit, preflight, rehearsal };
  renderDeviceChecks("pwa-icon-checks", PWA_ICON_MANUAL_CHECKS);
  renderDeviceChecks("iphone-checks", IPHONE_CHECKS);
  renderDeviceChecks("android-checks", ANDROID_CHECKS);
  renderDeviceChecks("google-tv-checks", GOOGLE_TV_CHECKS);
  updateVerdict(urlResults, gate, audit, preflight, rehearsal);

  btn.disabled = false;
}

document.getElementById("refresh-btn").addEventListener("click", () => loadAll().catch(console.error));
document.getElementById("vps-cmd-btn").addEventListener("click", () => openVpsModal("deploy"));
document.getElementById("env-prep-btn")?.addEventListener("click", () => openVpsModal("env_prep"));
document.getElementById("prod-start-btn")?.addEventListener("click", () => openVpsModal("production_start"));
document.getElementById("prod-verify-btn")?.addEventListener("click", () => openVpsModal("production_verify"));
document.getElementById("checklist-verify-btn")?.addEventListener("click", () => openVpsModal("checklist_verify"));
document.getElementById("pwa-icon-deploy-btn")?.addEventListener("click", () => openVpsModal("pwa_icon_deploy"));
document.getElementById("vps-modal-close").addEventListener("click", closeVpsModal);
document.getElementById("vps-modal").addEventListener("click", (e) => {
  if (e.target.id === "vps-modal") closeVpsModal();
});

loadAll().catch(console.error);
