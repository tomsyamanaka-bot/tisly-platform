import fs from "fs";
import path from "path";
function basicAuthHeader(username, password) {
    return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}
function joinUrl(base, segment) {
    const b = base.replace(/\/+$/, "");
    const s = segment.replace(/^\/+/, "");
    return `${b}/${s}`;
}
export class QnapWebDavClient {
    cfg;
    constructor(cfg) {
        this.cfg = cfg;
    }
    headers(extra) {
        return {
            Authorization: basicAuthHeader(this.cfg.username, this.cfg.password),
            ...extra,
        };
    }
    async testConnection() {
        if (!this.cfg.webdavUrl) {
            return { ok: false, message: "QNAP_WEBDAV_URL not set" };
        }
        try {
            const res = await fetch(this.cfg.webdavUrl, {
                method: "OPTIONS",
                headers: this.headers(),
            });
            if (res.ok || res.status === 401 || res.status === 405 || res.status === 207) {
                return { ok: true, message: `WebDAV reachable (${res.status})` };
            }
            return { ok: false, message: `WebDAV OPTIONS failed: ${res.status}` };
        }
        catch (e) {
            return { ok: false, message: e.message };
        }
    }
    async mkcol(remoteDir) {
        const parts = remoteDir.split("/").filter(Boolean);
        let acc = "";
        for (const part of parts) {
            acc = acc ? `${acc}/${part}` : part;
            const url = joinUrl(this.cfg.webdavUrl, acc);
            const res = await fetch(url, {
                method: "MKCOL",
                headers: this.headers(),
            });
            if (!res.ok && res.status !== 405 && res.status !== 409) {
                throw new Error(`MKCOL ${acc} failed: ${res.status}`);
            }
        }
    }
    async putFile(localPath, remotePath) {
        const url = joinUrl(this.cfg.webdavUrl, remotePath.replace(/^\/+/, ""));
        const body = fs.readFileSync(localPath);
        const res = await fetch(url, {
            method: "PUT",
            headers: {
                ...this.headers({ "Content-Type": "application/octet-stream" }),
            },
            body,
        });
        if (!res.ok) {
            throw new Error(`PUT ${remotePath} failed: ${res.status}`);
        }
    }
    async uploadLocalFiles(files) {
        const dirs = new Set();
        for (const f of files) {
            const dir = path.posix.dirname(f.remotePath.replace(/\\/g, "/"));
            if (dir && dir !== ".")
                dirs.add(dir);
        }
        for (const d of dirs) {
            await this.mkcol(d);
        }
        let count = 0;
        for (const f of files) {
            if (!fs.existsSync(f.localPath))
                continue;
            await this.putFile(f.localPath, f.remotePath);
            count++;
        }
        return count;
    }
}
