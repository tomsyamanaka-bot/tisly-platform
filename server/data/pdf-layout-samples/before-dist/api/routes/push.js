import { Router } from "express";
import { config } from "../../config.js";
import { countPushSubscriptions, savePushSubscription, sendWebPush, } from "../../notification/channels/web-push.js";
import { getRemoteTestStatus, markPushResult, } from "../../remote-test/remote-test-state.js";
import { requireRemoteTestToken } from "./remote-test.js";
export const pushRouter = Router();
const REMOTE_TEST_USER_ID = "remote-test";
const TEST_TITLE = "TiSLY 通知テスト";
const TEST_BODY = "Push通知が正常に届きました";
function isVapidConfigured() {
    return !!(config.vapid.publicKey && config.vapid.privateKey);
}
pushRouter.get("/vapid-public-key", (_req, res) => {
    if (!isVapidConfigured()) {
        res.status(503).json({
            error: "VAPID keys not configured",
            hint: "server で npm run vapid:setup を実行して再起動",
            configured: false,
        });
        return;
    }
    res.json({
        publicKey: config.vapid.publicKey,
        configured: true,
    });
});
pushRouter.use(requireRemoteTestToken);
pushRouter.get("/status", (_req, res) => {
    res.json({
        ok: true,
        vapidConfigured: isVapidConfigured(),
        subscriptionCount: countPushSubscriptions(REMOTE_TEST_USER_ID),
        userId: REMOTE_TEST_USER_ID,
    });
});
pushRouter.post("/subscribe", (req, res) => {
    if (!isVapidConfigured()) {
        res.status(503).json({
            error: "VAPID keys not configured",
            hint: "server で npm run vapid:setup を実行して再起動",
            configured: false,
        });
        return;
    }
    const { subscription } = req.body;
    if (!subscription?.endpoint || !subscription?.keys) {
        res.status(400).json({ error: "Web Push subscription required" });
        return;
    }
    const tokenId = savePushSubscription(REMOTE_TEST_USER_ID, subscription);
    res.status(201).json({
        ok: true,
        tokenId,
        userId: REMOTE_TEST_USER_ID,
        subscriptionCount: countPushSubscriptions(REMOTE_TEST_USER_ID),
    });
});
pushRouter.post("/test", async (_req, res) => {
    const payload = {
        title: TEST_TITLE,
        body: TEST_BODY,
        eventType: "push_test",
        deviceId: "remote-test",
        url: "/remote-test",
    };
    let webPush = {
        channel: "web_push",
        success: false,
        error: "not attempted",
    };
    try {
        webPush = await sendWebPush(payload, REMOTE_TEST_USER_ID);
    }
    catch (err) {
        webPush = {
            channel: "web_push",
            success: false,
            error: err instanceof Error ? err.message : String(err),
        };
    }
    markPushResult(webPush.success, webPush.error);
    const vapidConfigured = isVapidConfigured();
    const subscriptionCount = countPushSubscriptions(REMOTE_TEST_USER_ID);
    let hint;
    if (!webPush.success) {
        if (!vapidConfigured) {
            hint = "VAPID 未設定 — server で npm run vapid:setup を実行して再起動";
        }
        else if (subscriptionCount === 0) {
            hint = "Push 未登録 — iPhone: Safari → ホーム画面に追加 → Push 登録";
        }
        else {
            hint = webPush.error ?? "Push 送信失敗";
        }
    }
    res.json({
        ok: webPush.success,
        title: TEST_TITLE,
        body: TEST_BODY,
        primaryChannel: webPush.success ? "web_push" : null,
        channels: { web_push: webPush },
        push: {
            vapidConfigured,
            subscriptionCount,
            lastResult: getRemoteTestStatus().lastPushResult,
            lastSuccessAt: getRemoteTestStatus().lastPushSuccessAt,
        },
        hint,
    });
});
