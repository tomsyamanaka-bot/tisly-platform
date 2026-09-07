/**
 * 防犯ライト点灯時間帯判定（日またぎ対応）
 * フロント / 顧客 UI 共用。評価は Asia/Tokyo。
 */
(function (global) {
  "use strict";

  function getJstMinutesOfDay(now) {
    var at = now instanceof Date ? now : new Date();
    var parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Tokyo",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(at);
    var hour = 0;
    var minute = 0;
    var i;
    for (i = 0; i < parts.length; i++) {
      if (parts[i].type === "hour") hour = Number(parts[i].value);
      if (parts[i].type === "minute") minute = Number(parts[i].value);
    }
    if (hour === 24) hour = 0;
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0;
    return hour * 60 + minute;
  }

  /**
   * 開始〜終了の時間帯内か（日またぎ対応）
   * 同日: start < end → >= start && < end
   * 日跨ぎ: start > end → >= start || < end
   */
  function isWithinTimeRange(startTimeStr, endTimeStr, now) {
    var currentMinutes = getJstMinutesOfDay(now || new Date());
    var startParts = String(startTimeStr || "")
      .split(":")
      .map(Number);
    var endParts = String(endTimeStr || "")
      .split(":")
      .map(Number);
    var startH = startParts[0];
    var startM = startParts[1];
    var endH = endParts[0];
    var endM = endParts[1];
    if (
      !Number.isFinite(startH) ||
      !Number.isFinite(startM) ||
      !Number.isFinite(endH) ||
      !Number.isFinite(endM)
    ) {
      return false;
    }
    var startMinutes = startH * 60 + startM;
    var endMinutes = endH * 60 + endM;
    if (startMinutes === endMinutes) return true;
    if (startMinutes < endMinutes) {
      // 同日内の時間帯（例: 09:00 〜 17:00）
      return (
        currentMinutes >= startMinutes &&
        currentMinutes < endMinutes
      );
    }
    // 日をまたぐ時間帯（例: 18:00 〜 06:00）
    return (
      currentMinutes >= startMinutes ||
      currentMinutes < endMinutes
    );
  }

  global.TislySecurityTimeRangeV1 = {
    getJstMinutesOfDay: getJstMinutesOfDay,
    isWithinTimeRange: isWithinTimeRange,
  };
})(typeof window !== "undefined" ? window : globalThis);
