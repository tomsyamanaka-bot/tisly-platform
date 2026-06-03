import { config } from "../config.js";

export interface InviteEmailInput {
  customerName: string;
  customerCode: string;
  inviterName: string;
  role: string;
  expiresAt: string;
  inviteToken: string;
}

export function buildInviteAcceptUrl(customerCode: string, inviteToken: string): string {
  const base = config.publicUrl.replace(/\/$/, "");
  return `${base}/customer/${customerCode}?invite=${inviteToken}`;
}

export function buildInviteEmailSubject(input: InviteEmailInput): string {
  return `[TiSLY] ${input.customerName} への招待`;
}

export function buildInviteEmailHtml(input: InviteEmailInput): string {
  const acceptUrl = buildInviteAcceptUrl(input.customerCode, input.inviteToken);
  const expires = new Date(input.expiresAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  return `<!DOCTYPE html>
<html lang="ja">
<body style="font-family:sans-serif;line-height:1.6">
  <h2>TiSLY 顧客ポータルへの招待</h2>
  <p><strong>${input.customerName}</strong>（${input.customerCode}）の PRO Remote ポータルに招待されました。</p>
  <ul>
    <li>招待者: ${input.inviterName}</li>
    <li>ロール: ${input.role}</li>
    <li>有効期限: ${expires}</li>
  </ul>
  <p><a href="${acceptUrl}">招待を受け入れる</a></p>
  <p style="color:#666;font-size:0.9em">メール送信はプレースホルダです。本番では SMTP 経由で配信します。</p>
</body>
</html>`;
}

export function buildInviteEmailText(input: InviteEmailInput): string {
  const acceptUrl = buildInviteAcceptUrl(input.customerCode, input.inviteToken);
  return `TiSLY 招待

顧客: ${input.customerName} (${input.customerCode})
招待者: ${input.inviterName}
ロール: ${input.role}
有効期限: ${input.expiresAt}

受け入れ URL:
${acceptUrl}

(メール送信 placeholder)`;
}

/** Placeholder — wire to nodemailer in production. */
export async function sendInviteEmailPlaceholder(
  to: string,
  input: InviteEmailInput
): Promise<{ sent: false; todo: string; subject: string; html: string }> {
  return {
    sent: false,
    todo: `SMTP send to ${to} not implemented — use buildInviteEmailHtml in mailer`,
    subject: buildInviteEmailSubject(input),
    html: buildInviteEmailHtml(input),
  };
}
