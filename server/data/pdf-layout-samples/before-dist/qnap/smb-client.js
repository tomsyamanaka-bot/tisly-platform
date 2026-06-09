import { config } from "../config.js";
export function getQnapMode() {
    return config.qnap.mode === "real" ? "real" : "mock";
}
export function isQnapSmbConfigured() {
    return Boolean(config.qnap.host && config.qnap.share && config.qnap.username && config.qnap.password);
}
export async function smbWritePlaceholder(req) {
    if (getQnapMode() === "mock" || !isQnapSmbConfigured()) {
        return {
            ok: true,
            remotePath: req.remotePath,
            mode: "local-mock",
            message: `QNAP_MODE=${getQnapMode()} — ローカル mock（data/qnap-archive/）`,
        };
    }
    return {
        ok: false,
        remotePath: req.remotePath,
        mode: "smb",
        message: `SMB write pending (real mode): //${config.qnap.host}/${config.qnap.share}${req.remotePath}`,
    };
}
