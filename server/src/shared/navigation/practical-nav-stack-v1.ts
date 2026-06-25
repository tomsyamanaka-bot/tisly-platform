/**
 * 実務 PWA ナビゲーションスタック — ブラウザ履歴に依存しない 1 画面戻る制御
 */

export const NAV_STACK_STORAGE_KEY_V1 = "tisly_nav_stack_v1";
export const NAV_STACK_MAX_DEPTH_V1 = 64;

export function sanitizeNavPathV1(path: string | null | undefined): string | null {
  const p = String(path ?? "").trim();
  if (!p.startsWith("/") || p.startsWith("//")) return null;
  return p;
}

export function getDefaultNavFallbackV1(pathname: string): string {
  if (pathname.startsWith("/customer")) return "/customer";
  return "/app";
}

/** 遷移直前に現在 URL をスタックへ積む */
export function pushNavStackV1(stack: string[], currentUrl: string): string[] {
  const url = sanitizeNavPathV1(currentUrl);
  if (!url) return stack.slice();
  const next = stack.slice();
  if (next[next.length - 1] !== url) {
    next.push(url);
  }
  while (next.length > NAV_STACK_MAX_DEPTH_V1) {
    next.shift();
  }
  return next;
}

/** 戻る: 直前の 1 画面だけ取り出す */
export function popNavStackV1(stack: string[]): { stack: string[]; target: string | null } {
  if (!stack.length) return { stack: [], target: null };
  const next = stack.slice();
  const target = next.pop() ?? null;
  return { stack: next, target: sanitizeNavPathV1(target) };
}

export function peekNavStackV1(stack: string[]): string | null {
  if (!stack.length) return null;
  return sanitizeNavPathV1(stack[stack.length - 1]);
}
