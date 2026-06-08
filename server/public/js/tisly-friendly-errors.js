/** 一般ユーザー向けエラー文言（原因 + 次の操作） */

export function friendlyHttpError(message, status) {
  const msg = String(message || "");
  const code = Number(status) || 0;

  if (code === 401 || /unauthorized|token|ログイン/i.test(msg)) {
    return {
      title: "ログインが切れました",
      body: "もう一度ログインしてください。",
      action: "App Hub（/app）を開いて、ログインし直してください。",
    };
  }
  if (code === 403 || /forbidden|denied|権限/i.test(msg)) {
    return {
      title: "この操作はできません",
      body: "このアカウントでは使えない機能かもしれません。",
      action: "担当者に確認するか、別のユーザーでログインしてください。",
    };
  }
  if (code === 404 || /not found|見つかりません/i.test(msg)) {
    return {
      title: "データが見つかりません",
      body: "案件が削除されたか、まだ読み込みが終わっていない可能性があります。",
      action: "一覧に戻って、もう一度開き直してください。",
    };
  }
  if (code === 413 || /too large|大きすぎ/i.test(msg)) {
    return {
      title: "写真が大きすぎます",
      body: "画像のサイズが上限を超えています。",
      action: "カメラの画質を下げるか、別の写真を選んでください。",
    };
  }
  if (code >= 500 || /internal|server|サーバー/i.test(msg)) {
    return {
      title: "サーバーで問題が起きました",
      body: "しばらくしてからもう一度お試しください。",
      action: "続く場合は担当者に連絡してください。",
    };
  }
  if (/network|fetch|offline|ネットワーク/i.test(msg)) {
    return {
      title: "通信できませんでした",
      body: "電波やWi-Fiの状態を確認してください。",
      action: "接続が戻ったら、もう一度ボタンを押してください。",
    };
  }
  return {
    title: "うまくいきませんでした",
    body: msg || "原因が特定できませんでした。",
    action: "もう一度お試しください。続く場合は担当者に連絡してください。",
  };
}

export function renderFriendlyErrorHtml(err, status) {
  const f = friendlyHttpError(err?.message || err, status ?? err?.status);
  return `<strong>${escapeHtml(f.title)}</strong>${escapeHtml(f.body)}<br><small>→ ${escapeHtml(f.action)}</small>`;
}

export function friendlyLoginError(body, status) {
  const err = body?.error || "";
  if (status === 401 || /password|パスワード|認証/i.test(err)) {
    return "パスワードが違うようです。入力し直すか、担当者に確認してください。";
  }
  if (/customer|会社コード|tenant/i.test(err)) {
    return "会社コードが見つかりません。大文字・数字を確認してください（例: TOMS001）。";
  }
  if (/user|ユーザー/i.test(err)) {
    return "ユーザー名が見つかりません。スペルとピリオド（例: toms001.surveyor）を確認してください。";
  }
  return err || "ログインできませんでした。入力内容を確認して、もう一度お試しください。";
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
