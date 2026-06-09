export declare const DEPLOYMENT_CHECKLIST_ITEMS: readonly [{
    readonly id: "esp_install";
    readonly label: "ESP設置";
    readonly description: "制御盤設置・配線確認";
}, {
    readonly id: "shelly_install";
    readonly label: "Shelly設置";
    readonly description: "リレー・スマートスイッチ設置";
}, {
    readonly id: "camera_install";
    readonly label: "カメラ設置";
    readonly description: "外周・玄関カメラ取付";
}, {
    readonly id: "sensor_install";
    readonly label: "センサー設置";
    readonly description: "室内センサー・ドアセンサー";
}, {
    readonly id: "mqtt_test";
    readonly label: "MQTT疎通";
    readonly description: "ブローカー接続・heartbeat確認";
}, {
    readonly id: "google_tv_display";
    readonly label: "Google TV表示";
    readonly description: "TVダッシュボード表示確認";
}, {
    readonly id: "pro_remote_display";
    readonly label: "PRO Remote表示";
    readonly description: "フロアマップ・設備表示";
}, {
    readonly id: "customer_portal_check";
    readonly label: "顧客ポータル確認";
    readonly description: "ログイン・設備一覧";
}, {
    readonly id: "qr_apply";
    readonly label: "QR貼付";
    readonly description: "設備QRラベル貼付";
}, {
    readonly id: "photo_save";
    readonly label: "写真保存";
    readonly description: "施工写真アップロード";
}, {
    readonly id: "completion_report";
    readonly label: "完了報告";
    readonly description: "完了報告書作成";
}];
export type DeploymentChecklistItemId = (typeof DEPLOYMENT_CHECKLIST_ITEMS)[number]["id"];
export interface DeploymentChecklistItemState {
    itemId: DeploymentChecklistItemId;
    label: string;
    description: string;
    completed: boolean;
    completedAt: string | null;
    completedBy: string | null;
    note: string | null;
}
export interface DeploymentChecklistRC2 {
    projectId: string;
    customerCode: string;
    projectTitle: string;
    items: DeploymentChecklistItemState[];
    completedCount: number;
    totalCount: number;
    allComplete: boolean;
    updatedAt: string;
}
export declare function getDeploymentChecklistRC2(projectId: string): DeploymentChecklistRC2 | null;
export declare function completeDeploymentChecklistItem(projectId: string, itemId: string, actor?: string, note?: string): DeploymentChecklistItemState | null;
