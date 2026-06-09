const focusStateByCode = new Map();
const FOCUS_DURATION_MS = 10_000;
const FLOOR_LABELS = {
    perimeter: "外周",
    "1f": "1F",
    "2f": "2F",
};
export function setTvFocusState(input) {
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
export function getTvFocusState(customerCode) {
    const code = customerCode.toUpperCase();
    const state = focusStateByCode.get(code);
    const now = Date.now();
    if (state && state.active && new Date(state.expiresAt).getTime() <= now) {
        state.active = false;
        state.cameraId = null;
    }
    const remainingSec = state?.active && state.expiresAt
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
export function clearTvFocusState(customerCode) {
    const code = customerCode.toUpperCase();
    const state = focusStateByCode.get(code);
    if (state) {
        state.active = false;
        state.cameraId = null;
    }
}
