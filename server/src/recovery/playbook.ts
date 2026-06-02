export interface PlaybookStep {
  order: number;
  action: string;
  responsible: string;
}

export interface RecoveryPlaybook {
  eventType: string;
  title: string;
  steps: PlaybookStep[];
}

export const RECOVERY_PLAYBOOKS: RecoveryPlaybook[] = [
  {
    eventType: "heartbeat",
    title: "Heartbeat 断 — 通信復旧",
    steps: [
      { order: 1, action: "デバイス電源・ネットワークを確認", responsible: "現場" },
      { order: 2, action: "MQTT / HTTP ingest ログを確認", responsible: "NOC" },
      { order: 3, action: "自動再接続結果を 5 分待機", responsible: "システム" },
      { order: 4, action: "未復旧なら手動再起動", responsible: "保全" },
    ],
  },
  {
    eventType: "intrusion",
    title: "侵入検知 — セキュリティ対応",
    steps: [
      { order: 1, action: "警報内容・Zone を確認", responsible: "SOC" },
      { order: 2, action: "カメラ映像を確認（QNAP / H.View）", responsible: "SOC" },
      { order: 3, action: "現場へ連絡・警察要請判断", responsible: "管理者" },
      { order: 4, action: "事後レポート作成", responsible: "管理者" },
    ],
  },
  {
    eventType: "estop",
    title: "非常停止 — 安全確認",
    steps: [
      { order: 1, action: "ライン停止状態を確認", responsible: "現場" },
      { order: 2, action: "原因調査（機械・人）", responsible: "保全" },
      { order: 3, action: "復旧許可後に PLC リセット", responsible: "保全" },
    ],
  },
  {
    eventType: "perimeter",
    title: "外周センサー — 誤報確認",
    steps: [
      { order: 1, action: "天候・動物・障害物を確認", responsible: "SOC" },
      { order: 2, action: "センサー調整または Zone 一時無効", responsible: "技術" },
    ],
  },
  {
    eventType: "recovery",
    title: "自動復旧完了",
    steps: [
      { order: 1, action: "復旧ログを確認", responsible: "NOC" },
      { order: 2, action: "再発防止メモを記録", responsible: "管理者" },
    ],
  },
];

export function getPlaybook(eventType: string): RecoveryPlaybook | undefined {
  return RECOVERY_PLAYBOOKS.find((p) => p.eventType === eventType);
}
