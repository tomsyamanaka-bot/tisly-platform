/**
 * Google Calendar 連携 — OAuth 対応（mock / real 切替）
 * 取得: 予定名・開始/終了日時・終日・場所・説明 + カテゴリ自動判定
 */
import { getGoogleOAuthStatus, getGoogleAuthUrl, handleGoogleOAuthCallback, refreshGoogleAccessToken, } from "./googleOAuthService.js";
export const GOOGLE_CALENDAR_CONFIG_PLACEHOLDER = {
    clientId: process.env.GOOGLE_CALENDAR_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET ?? "",
    redirectUri: process.env.GOOGLE_CALENDAR_REDIRECT_URI ??
        process.env.GOOGLE_REDIRECT_URI ??
        "https://tisly.jp/api/schedule/v1/oauth/callback",
    calendarId: process.env.GOOGLE_CALENDAR_ID ?? "primary",
};
const CONSTRUCTION_KW = [
    "工事", "設置", "現調", "施工", "配線", "カメラ", "lan", "防犯", "交換", "取付", "配管", "電気",
];
const OFFICE_KW = ["見積", "請求", "入金", "事務", "会議", "打合", "ミーティング", "税理", "書類", "メール"];
const FAMILY_KW = ["家族", "学校", "習い", "子供", "旅行", "休み", "誕生日", "病院", "通院"];
const URGENT_KW = ["緊急", "重要", "至急", "トラブル", "故障", "アラーム", "警報"];
/** 予定名・説明・場所からカテゴリを自動判定 */
export function classifyEventCategory(title, description, location) {
    const text = `${title} ${description ?? ""} ${location ?? ""}`.toLowerCase();
    if (URGENT_KW.some((k) => text.includes(k)))
        return "urgent";
    if (FAMILY_KW.some((k) => text.includes(k)))
        return "family";
    if (CONSTRUCTION_KW.some((k) => text.includes(k.toLowerCase())))
        return "construction";
    if (OFFICE_KW.some((k) => text.includes(k)))
        return "office";
    return "office";
}
function addDays(iso, n) {
    const d = new Date(`${iso}T12:00:00`);
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
}
function weekdayOffset(base) {
    const day = base.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(base);
    monday.setDate(base.getDate() + diff);
    return monday.toISOString().slice(0, 10);
}
function parseGoogleDateTime(start, end) {
    if (start.date) {
        return {
            date: start.date,
            startTime: null,
            endTime: null,
            allDay: true,
        };
    }
    const startDt = start.dateTime ?? "";
    const endDt = end.dateTime ?? "";
    const date = startDt.slice(0, 10);
    const startTime = startDt.length >= 16 ? startDt.slice(11, 16) : null;
    const endTime = endDt.length >= 16 ? endDt.slice(11, 16) : null;
    return { date, startTime, endTime, allDay: false };
}
function googleItemToEvent(item) {
    if (!item.id || !item.summary || !item.start)
        return null;
    const { date, startTime, endTime, allDay } = parseGoogleDateTime(item.start, item.end ?? item.start);
    const title = item.summary.trim();
    return {
        id: `gcal-${item.id}`,
        date,
        title,
        category: classifyEventCategory(title, item.description, item.location),
        source: "google",
        externalId: item.id,
        startTime,
        endTime,
        allDay,
        location: item.location?.trim() || null,
        description: item.description?.trim() || null,
    };
}
/** デモ用モック予定 */
export function mockCalendarEvents(startDate, endDate) {
    const events = [];
    const start = new Date(`${startDate}T12:00:00`);
    const end = new Date(`${endDate}T12:00:00`);
    const seed = startDate.replace(/-/g, "").length;
    const templates = [
        { title: "防犯カメラ設置", category: "construction", wd: 1, startTime: "08:30", endTime: "12:00", location: "守谷市" },
        { title: "インターホン交換", category: "construction", wd: 2, startTime: "10:00", endTime: "14:00", location: "つくばみらい市" },
        { title: "見積書まとめ", category: "office", wd: 2, startTime: "15:00", endTime: "17:00" },
        { title: "請求・入金確認", category: "office", wd: 3, startTime: "09:00", endTime: "10:30" },
        { title: "家族の予定", category: "family", wd: 5, startTime: "18:00", endTime: "20:00" },
        { title: "緊急対応", category: "urgent", wd: 4, startTime: "13:00", endTime: "15:00", location: "取手市" },
        { title: "LAN配線工事", category: "construction", wd: 3, startTime: "13:00", endTime: "17:00", location: "取手市" },
        { title: "現調（大阪）", category: "construction", wd: 1, startTime: "14:00", endTime: "16:00", location: "大阪市" },
    ];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const iso = d.toISOString().slice(0, 10);
        const wd = d.getDay();
        templates.forEach((tpl, i) => {
            if (tpl.wd !== wd)
                return;
            if ((seed + i + d.getDate()) % 3 === 0)
                return;
            events.push({
                id: `mock-${iso}-${i}`,
                date: iso,
                title: tpl.title,
                category: tpl.category,
                source: "mock",
                externalId: `mock-ext-${iso}-${i}`,
                startTime: tpl.startTime,
                endTime: tpl.endTime,
                allDay: false,
                location: tpl.location ?? null,
                description: null,
            });
        });
    }
    return events;
}
export class MockGoogleCalendarProvider {
    mode = "mock";
    async listEvents(startDate, endDate) {
        return mockCalendarEvents(startDate, endDate);
    }
}
export class RealGoogleCalendarProvider {
    mode = "real";
    calendarId;
    constructor(calendarId = GOOGLE_CALENDAR_CONFIG_PLACEHOLDER.calendarId) {
        this.calendarId = calendarId;
    }
    async listEvents(startDate, endDate) {
        const token = await refreshGoogleAccessToken();
        const timeMin = `${startDate}T00:00:00+09:00`;
        const timeMax = `${addDays(endDate, 1)}T00:00:00+09:00`;
        const params = new URLSearchParams({
            timeMin,
            timeMax,
            singleEvents: "true",
            orderBy: "startTime",
            maxResults: "250",
        });
        const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events?${params}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) {
            const err = (await res.json().catch(() => ({})));
            throw new Error(err.error?.message ?? `Google Calendar list failed (${res.status})`);
        }
        const json = (await res.json());
        const events = [];
        for (const item of json.items ?? []) {
            const ev = googleItemToEvent(item);
            if (ev && ev.date >= startDate && ev.date <= endDate)
                events.push(ev);
        }
        return events;
    }
}
function resolveProvider() {
    const status = getGoogleOAuthStatus();
    if (status.mode === "real" && status.connected) {
        return new RealGoogleCalendarProvider();
    }
    return new MockGoogleCalendarProvider();
}
let provider = resolveProvider();
export function setCalendarProvider(p) {
    provider = p;
}
export function resetCalendarProvider() {
    provider = resolveProvider();
}
export function getCalendarProvider() {
    return provider;
}
export async function fetchCalendarEvents(startDate, endDate) {
    return provider.listEvents(startDate, endDate);
}
export async function syncGoogleCalendarEvents(startDate, endDate) {
    resetCalendarProvider();
    const events = await provider.listEvents(startDate, endDate);
    return { events, mode: provider.mode, count: events.length };
}
export function getCalendarOAuthStatus() {
    return getGoogleOAuthStatus();
}
export function getCalendarAuthUrl() {
    return getGoogleAuthUrl("schedule");
}
export async function handleCalendarOAuthCallback(input) {
    return handleGoogleOAuthCallback(input);
}
export function getWeekStartWithOffset(offsetWeeks = 0) {
    const now = new Date();
    const monday = weekdayOffset(now);
    return addDays(monday, offsetWeeks * 7);
}
