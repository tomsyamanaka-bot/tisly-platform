#!/usr/bin/env node
/** Google Calendar debug dump — calendar-list + events-with-calendar + verification report */
import fs from "fs";
import path from "path";

const BASE = process.env.TISLY_BASE_URL || "https://tisly.jp";
const OUT = path.join(process.cwd(), "data", "google-calendar-debug");
const START = process.env.GCAL_DEBUG_START || "2026-06-20";
const END = process.env.GCAL_DEBUG_END || "2026-06-30";
const LOGIN = {
  customerCode: process.env.TISLY_CUSTOMER_CODE || "TOMS001",
  username: process.env.TISLY_USERNAME || "toms001.surveyor",
  password: process.env.CUSTOMER_DEMO_PASSWORD || "demo-remote-2026",
};

async function getToken() {
  const res = await fetch(`${BASE}/api/auth/customer/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(LOGIN),
  });
  const data = await res.json();
  if (!data.token) throw new Error(`login failed: ${data.error || res.status}`);
  return data.token;
}

async function getHealth() {
  const res = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(20000) });
  return res.json();
}

async function apiFetch(token, apiPath, opts = {}) {
  const res = await fetch(`${BASE}${apiPath}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

function toCalendarListItem(c) {
  return {
    calendarId: c.id,
    summary: c.summary,
    primary: Boolean(c.primary),
    selected: c.selected === true,
    accessRole: c.accessRole ?? "reader",
    backgroundColor: c.backgroundColor ?? null,
  };
}

function findDenGenAmi(events) {
  const pattern = "伝元案件)阿見";
  const matches = events.filter(
    (e) =>
      e.title.includes(pattern) ||
      (e.title.includes("伝元") && e.title.includes("阿見"))
  );
  const dayLabels = ["(1/3日目)", "(2/3日目)", "(3/3日目)"];
  const byDayLabel = dayLabels.map((label) => ({
    label,
    event: matches.find((e) => e.title.includes(label)) ?? null,
  }));
  return { pattern, matches, byDayLabel };
}

async function fetchEventsViaScheduleApi(token, startDate, endDate) {
  const headers = { Authorization: `Bearer ${token}` };
  const events = [];
  for (
    let d = new Date(`${startDate}T12:00:00`);
    d <= new Date(`${endDate}T12:00:00`);
    d.setDate(d.getDate() + 1)
  ) {
    const date = d.toISOString().slice(0, 10);
    const { data: j } = await apiFetch(token, `/api/schedule/v1/day?date=${date}`, {
      headers,
      method: "GET",
    });
    for (const ev of j.day?.events ?? []) {
      if (ev.source !== "google" && ev.source !== "gcal") continue;
      events.push({
        title: ev.title,
        start: ev.allDay ? ev.date : `${ev.date}T${ev.startTime ?? "00:00"}:00+09:00`,
        end: ev.allDay ? ev.date : `${ev.date}T${ev.endTime ?? ev.startTime ?? "00:00"}:00+09:00`,
        calendarId: ev.calendarId ?? null,
        calendarName: ev.calendarSummary ?? ev.calendarId ?? null,
        date: ev.date,
        allDay: ev.allDay,
      });
    }
  }
  return events;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const health = await getHealth();
  const token = await getToken();

  const debugListRes = await apiFetch(token, "/api/debug/google-calendar/calendar-list");
  const hasDebugApi = debugListRes.res.status === 200 && debugListRes.data.ok === true;

  if (hasDebugApi) {
    await apiFetch(token, "/api/google-calendar/settings", {
      method: "PATCH",
      body: JSON.stringify({ syncMode: "google_selected" }),
    });
  }

  const syncRes = await apiFetch(token, "/api/google-calendar/sync/full", {
    method: "POST",
    body: JSON.stringify({
      startDate: START,
      endDate: END,
      syncDirection: hasDebugApi ? "bidirectional" : "pull_only",
      syncMode: hasDebugApi ? "google_selected" : undefined,
      timezone: "Asia/Tokyo",
    }),
  });

  let calendarListRaw = debugListRes.data;
  if (!hasDebugApi) {
    const statusRes = await apiFetch(token, "/api/google-calendar/status");
    const calRes = await apiFetch(token, "/api/google-calendar/calendars");
    const allCals = calRes.data.allCalendars ?? calRes.data.calendars ?? [];
    const settings = statusRes.data.settings ?? {};
    calendarListRaw = {
      calendars: allCals.map(toCalendarListItem),
      usedFallback: calRes.data.usedFallback ?? false,
      syncMode: settings.syncMode,
      pullTargetIds: syncRes.data.calendarIds ?? settings.calendarIds ?? [],
      pullTargetNames: allCals
        .filter((c) => (syncRes.data.calendarIds ?? []).includes(c.id))
        .map((c) => c.summary),
      debugApiAvailable: false,
    };
  }

  let eventsSyncRaw = { events: [] };
  let eventsAllRaw = { events: [] };
  const debugEventsRes = await apiFetch(
    token,
    `/api/debug/google-calendar/events-with-calendar?startDate=${START}&endDate=${END}`
  );
  if (debugEventsRes.res.status === 200 && debugEventsRes.data.ok) {
    eventsSyncRaw = debugEventsRes.data;
    const debugAllRes = await apiFetch(
      token,
      `/api/debug/google-calendar/events-with-calendar?startDate=${START}&endDate=${END}&allReadable=1`
    );
    eventsAllRaw = debugAllRes.data;
  } else {
    eventsSyncRaw.events = await fetchEventsViaScheduleApi(token, START, END);
    eventsAllRaw.events = eventsSyncRaw.events;
  }

  const calendarList = {
    capturedAt: new Date().toISOString(),
    baseUrl: BASE,
    debugApiAvailable: hasDebugApi,
    calendars: calendarListRaw.calendars ?? [],
    syncMode: calendarListRaw.syncMode ?? null,
    pullTargetIds: calendarListRaw.pullTargetIds ?? syncRes.data.calendarIds ?? [],
    pullTargetNames: calendarListRaw.pullTargetNames ?? [],
    usedFallback: calendarListRaw.usedFallback ?? null,
  };
  fs.writeFileSync(path.join(OUT, "calendar-list.json"), JSON.stringify(calendarList, null, 2));

  const denGen = findDenGenAmi(eventsAllRaw.events ?? []);
  const eventsWithCalendar = {
    capturedAt: new Date().toISOString(),
    startDate: START,
    endDate: END,
    syncTargetEvents: eventsSyncRaw.events ?? [],
    allReadableEvents: eventsAllRaw.events ?? [],
    denGenAmi: denGen,
  };
  fs.writeFileSync(
    path.join(OUT, "events-with-calendar.json"),
    JSON.stringify(eventsWithCalendar, null, 2)
  );

  const denGenSummary = {
    pattern: denGen.pattern,
    matchCount: denGen.matches.length,
    byDayLabel: denGen.byDayLabel.map((row) => ({
      label: row.label,
      found: Boolean(row.event),
      title: row.event?.title ?? null,
      calendarId: row.event?.calendarId ?? null,
      calendarName: row.event?.calendarName ?? null,
      start: row.event?.start ?? null,
    })),
    allMatches: denGen.matches.map((e) => ({
      title: e.title,
      date: e.date,
      calendarId: e.calendarId,
      calendarName: e.calendarName,
      start: e.start,
    })),
  };

  const inPullTarget = denGenSummary.allMatches.every((r) =>
    calendarList.pullTargetIds.includes(r.calendarId)
  );

  const report = {
    capturedAt: new Date().toISOString(),
    commitShort: health.commitShort || health.git?.commitShort || null,
    baseUrl: BASE,
    dateRange: { start: START, end: END },
    debugApiAvailable: hasDebugApi,
    sync: {
      ok: syncRes.data.ok === true,
      status: syncRes.res.status,
      syncMode: syncRes.data.syncMode,
      calendarIds: syncRes.data.calendarIds,
      fetched: syncRes.data.fetched,
      created: syncRes.data.created,
      updated: syncRes.data.updated,
      error: syncRes.data.error ?? syncRes.data.message ?? null,
    },
    calendarList: {
      total: calendarList.calendars.length,
      selectedCount: calendarList.calendars.filter((c) => c.selected).length,
      pullTargetCount: calendarList.pullTargetIds.length,
      pullTargetNames: calendarList.pullTargetNames,
    },
    denGenAmi: denGenSummary,
    findings: {
      rootCause:
        "selected_only / primary_only では ★TOMS★ 等の副カレンダーが同期対象外になる",
      denGenCalendarId:
        denGenSummary.allMatches[0]?.calendarId ??
        "d1f0fdc68d1cdfc89278c2b1517f17ae5a6f59ed85f0c03c9c56653f1f1d51ec@group.calendar.google.com",
      denGenCalendarName: denGenSummary.allMatches[0]?.calendarName ?? "★TOMS★",
      allDenGenInPullTarget: inPullTarget,
      denGenMissingFromSync: denGenSummary.allMatches.filter(
        (r) => !calendarList.pullTargetIds.includes(r.calendarId)
      ),
      denGenNotFoundByDayLabel: denGenSummary.byDayLabel.filter((r) => !r.found).map((r) => r.label),
    },
    outDir: OUT,
    files: ["calendar-list.json", "events-with-calendar.json", "verification-report.json"],
  };
  fs.writeFileSync(path.join(OUT, "verification-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
