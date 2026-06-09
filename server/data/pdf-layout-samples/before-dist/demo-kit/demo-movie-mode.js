/**
 * Phase909 — Demo Movie Mode（展示会用自動再生）
 */
import { triggerDemoNotification } from "./demo-notifications.js";
import { runDemoShellyReboot } from "./demo-shelly-reboot.js";
const SCENE_SEQUENCE = ["notify", "intrusion", "recovery", "maintenance"];
const SCENE_KIND = {
    notify: "maintenance_due",
    intrusion: "intrusion",
    recovery: "esp_fault",
    maintenance: "maintenance_due",
};
let movieTimer = null;
let movieRunning = false;
let movieCustomer = "TOMS001";
let movieStep = 0;
export function getDemoMovieStatus() {
    return {
        running: movieRunning,
        customerCode: movieCustomer,
        currentScene: movieRunning ? SCENE_SEQUENCE[movieStep] ?? null : null,
        step: movieStep,
        totalSteps: SCENE_SEQUENCE.length,
        scenes: SCENE_SEQUENCE,
    };
}
export function stopDemoMovie() {
    if (movieTimer)
        clearTimeout(movieTimer);
    movieTimer = null;
    movieRunning = false;
    movieStep = 0;
}
async function runScene(scene, customerCode) {
    if (scene === "recovery") {
        await triggerDemoNotification("esp_fault", customerCode);
        await new Promise((r) => setTimeout(r, 2000));
        runDemoShellyReboot(customerCode);
        return;
    }
    const kind = SCENE_KIND[scene];
    if (kind)
        await triggerDemoNotification(kind, customerCode);
}
export function startDemoMovie(customerCode = "TOMS001", intervalMs = 8000) {
    stopDemoMovie();
    movieCustomer = customerCode.toUpperCase();
    movieRunning = true;
    movieStep = 0;
    const tick = async () => {
        if (!movieRunning)
            return;
        const scene = SCENE_SEQUENCE[movieStep];
        if (scene) {
            try {
                await runScene(scene, movieCustomer);
            }
            catch (e) {
                console.warn("[DemoMovie]", e);
            }
        }
        movieStep = (movieStep + 1) % SCENE_SEQUENCE.length;
        movieTimer = setTimeout(() => void tick(), intervalMs);
    };
    void tick();
    return { ok: true, intervalMs };
}
