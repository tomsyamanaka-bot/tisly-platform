/** @typedef {import('../../src/shared/navigation/practical-nav-stack-v1.ts')} */

export const NAV_STACK_STORAGE_KEY_V1 = "tisly_nav_stack_v1";
export const NAV_STACK_MAX_DEPTH_V1 = 64;

export function sanitizeNavPathV1(path) {
  const p = String(path ?? "").trim();
  if (!p.startsWith("/") || p.startsWith("//")) return null;
  return p;
}

export function getDefaultNavFallbackV1(pathname) {
  if (String(pathname).startsWith("/customer")) return "/customer";
  return "/app";
}

export function pushNavStackV1(stack, currentUrl) {
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

export function popNavStackV1(stack) {
  if (!stack.length) return { stack: [], target: null };
  const next = stack.slice();
  const target = next.pop() ?? null;
  return { stack: next, target: sanitizeNavPathV1(target) };
}

export function peekNavStackV1(stack) {
  if (!stack.length) return null;
  return sanitizeNavPathV1(stack[stack.length - 1]);
}
