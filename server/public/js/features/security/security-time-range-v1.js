/**
 * 防犯ライト点灯時間帯判定（日またぎ対応）
 * フロント / 顧客 UI 共用。評価は Asia/Tokyo。
 */
(function (global) {
  "use strict";

  function getJstMinutesOfDay(now) {
    var at = now instanceof Date ? now : new Date();
    var ms = at.getTime();
    if (!Number.isFinite(ms)) return 0;
    /* Intl hour12 誤判定を避け
     * UTC+9 算術で JST 分を算出する */
    var jst = new Date(ms + 9 * 60 * 60 * 1000);
    var hour = jst.getUTCHours();
    var minute = jst.getUTCMinutes();
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

  /** 昼夜タイルの「いま」札を現在時刻で塗る */
  function paintDayNightTiles(rootId, startId, endId) {
    var root = document.getElementById(rootId);
    if (!root) return;
    var startEl = document.getElementById(startId);
    var endEl = document.getElementById(endId);
    var start = startEl && startEl.value ? startEl.value : "18:00";
    var end = endEl && endEl.value ? endEl.value : "06:00";
    var night = isWithinTimeRange(start, end);
    var dayTile = root.querySelector(".ts-dn-day");
    var nightTile = root.querySelector(".ts-dn-night");
    if (dayTile) {
      dayTile.classList.toggle("is-now", !night);
    }
    if (nightTile) {
      nightTile.classList.toggle("is-now", night);
    }
  }

  global.TislySecurityTimeRangeV1 = {
    getJstMinutesOfDay: getJstMinutesOfDay,
    isWithinTimeRange: isWithinTimeRange,
    paintDayNightTiles: paintDayNightTiles,
  };
})(typeof window !== "undefined" ? window : globalThis);
