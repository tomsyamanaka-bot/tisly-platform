const focusStateByCode = new Map<
  string,
  {
    cameraId: string | null;
    floor: string;
    viewLabel: string;
    trigger: string;
    startedAt: string;
    expiresAt: string;
    active: boolean;
  }
>();

const FOCUS_DURATION_MS = 10_000;

const FLOOR_LABELS: Record<string, string> = {
  perimeter: "外周",
  "1f": "1F",
  "2f": "2F",
};

export function setTvFocusState(input: {
  customerCode: string;
  cameraId: string;
  floor?: string;
  trigger?: string;
}): void {
  const code = input.customerCode.toUpperCase();
  const floor = input.floor ?? "1f";
  const now = Date.now();
  focusStateByCode.set(code, {
    cameraId: input.cameraId,
    floor,
    viewLabel: FLOOR_LABELS[floor] ?? floor,
    trigger: input.trigger ?? "sensor",
    startedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + FOCUS_DURATION_MS).toISOString(),
    active: true,
  });
}

export function getTvFocusState(customerCode: string): {
  customerCode: string;
  focusCamera: {
    active: boolean;
    cameraId: string | null;
    floor: string;
    viewLabel: string;
    trigger: string;
    startedAt: string | null;
    expiresAt: string | null;
    remainingSec: number;
  };
  fixedViews: string[];
} {
  const code = customerCode.toUpperCase();
  const state = focusStateByCode.get(code);
  const now = Date.now();

  if (state && state.active && new Date(state.expiresAt).getTime() <= now) {
    state.active = false;
    state.cameraId = null;
  }

  const remainingSec =
    state?.active && state.expiresAt
      ? Math.max(0, Math.ceil((new Date(state.expiresAt).getTime() - now) / 1000))
      : 0;

  return {
    customerCode: code,
    focusCamera: {
      active: Boolean(state?.active && state.cameraId),
      cameraId: state?.active ? state.cameraId : null,
      floor: state?.floor ?? "1f",
      viewLabel: state?.viewLabel ?? "1F",
      trigger: state?.trigger ?? "none",
      startedAt: state?.startedAt ?? null,
      expiresAt: state?.active ? state.expiresAt : null,
      remainingSec,
    },
    fixedViews: ["perimeter", "1f", "2f"],
  };
}

export function clearTvFocusState(customerCode: string): void {
  const code = customerCode.toUpperCase();
  const state = focusStateByCode.get(code);
  if (state) {
    state.active = false;
    state.cameraId = null;
  }
}
