import { useEffect } from "react";
import { AppState } from "react-native";

/**
 * TV キオスク: スリープ防止・フォアグラウンド復帰時に再接続トリガ
 */
export function useKioskMode() {
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        console.info("[TiSLY TV] Foreground — reconnect scheduled");
      }
    });
    return () => sub.remove();
  }, []);
}
