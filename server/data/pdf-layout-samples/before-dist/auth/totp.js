import { authenticator } from "otplib";
import QRCode from "qrcode";
import { getDatabase } from "../db/database.js";
import { config } from "../config.js";
authenticator.options = { window: 1 };
export function setupTotp(userId) {
    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(userId, "TiSLY", secret);
    getDatabase()
        .prepare(`INSERT INTO totp_secrets (user_id, secret, enabled)
       VALUES (?, ?, 0)
       ON CONFLICT(user_id) DO UPDATE SET secret = excluded.secret, enabled = 0`)
        .run(userId, secret);
    return QRCode.toDataURL(otpauthUrl).then((qrDataUrl) => ({
        secret,
        otpauthUrl,
        qrDataUrl,
        mock: false,
    }));
}
export function verifyTotpCode(userId, code) {
    const row = getDatabase()
        .prepare(`SELECT secret, enabled FROM totp_secrets WHERE user_id = ?`)
        .get(userId);
    if (!row)
        return false;
    return authenticator.verify({ token: code, secret: row.secret });
}
export function enableTotp(userId, code) {
    if (!verifyTotpCode(userId, code))
        return false;
    getDatabase()
        .prepare(`UPDATE totp_secrets SET enabled = 1, verified_at = datetime('now') WHERE user_id = ?`)
        .run(userId);
    return true;
}
export function disableTotp(userId, code) {
    if (code && !verifyTotpCode(userId, code))
        return false;
    getDatabase().prepare(`DELETE FROM totp_secrets WHERE user_id = ?`).run(userId);
    return true;
}
export function isTotpEnabled(userId) {
    const row = getDatabase()
        .prepare(`SELECT enabled FROM totp_secrets WHERE user_id = ?`)
        .get(userId);
    return Boolean(row?.enabled);
}
export function isRequire2fa() {
    return process.env.REQUIRE_2FA === "true";
}
export function adminRequires2fa(userId) {
    if (!isRequire2fa())
        return false;
    return userId === "admin-default" || userId === config.auth.adminUsername;
}
/** @deprecated use verifyTotpCode */
export function verifyTotp(userId, code) {
    return verifyTotpCode(userId, code);
}
