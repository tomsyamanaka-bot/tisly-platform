# Google Calendar Integration

## 現状 (Phase 541–560)

- 実装: `server/src/business/services/googleCalendarService.ts`
- 再エクスポート: `server/src/services/googleCalendarService.ts`
- モード: **mock** (`MockGoogleCalendarProvider`)
- ドラフト種別: 現調 (`survey` / `site-survey`)、工事 (`construction`)、入金 (`payment`)

## 差し替え方法

```typescript
import { setGoogleCalendarProvider } from "../services/googleCalendarService.js";

setGoogleCalendarProvider({
  async createEvent(draft) {
    // Google Calendar API v3
    return { externalId: "...", status: "synced" };
  },
});
```
