import type { CapacitorConfig } from '@capacitor/cli';

/**
 * TiSLY iOS（Capacitor）設定
 *
 * - Android TWA（com.tisly.app → https://tisly.jp/app）と同等に、
 *   本番 WebView は tisly.jp を表示する（既存 PWA / API を破壊しない）。
 * - webDir は cap sync 用。CAPACITOR_SERVER_URL=local でローカル www のみ読込。
 * - Bundle ID: jp.tisly.app（Android の com.tisly.app とは別 ID）
 */
const serverUrlEnv = process.env.CAPACITOR_SERVER_URL;
const useRemoteShell = serverUrlEnv !== 'local';

const config: CapacitorConfig = {
  appId: 'jp.tisly.app',
  appName: 'TiSLY',
  webDir: 'www',
  server: {
    ...(useRemoteShell
      ? {
          url: serverUrlEnv && serverUrlEnv.length > 0 ? serverUrlEnv : 'https://tisly.jp',
          cleartext: false,
        }
      : {}),
    allowNavigation: ['tisly.jp', 'www.tisly.jp'],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: true,
      backgroundColor: '#0D1117',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    Camera: {
      // Info.plist 文言は scripts/ios-patch-info-plist.mjs で一元管理
    },
  },
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    allowsLinkPreview: false,
    // Xcode scheme name (Capacitor default). Bundle ID is appId: jp.tisly.app
    scheme: 'App',
  },
};

export default config;
