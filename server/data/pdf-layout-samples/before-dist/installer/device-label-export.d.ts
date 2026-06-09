export declare function buildDevicesLabelsCsv(customerId: string): string;
export declare function getDeviceLabelJson(customerId: string, customerCode: string, deviceId: string): {
    device_id: string;
    serial: string;
    customer: string;
    site: string | null;
    zone: string | null;
    qr: string;
    install_date: string | null;
    label_text: string;
    expires_at: string;
};
export declare function buildDeviceLabelSvg(customerId: string, deviceId: string): string;
/** King Jim テプラ用 CSV（WebLink インポート向けプレースホルダ） */
export declare function buildTepraLabelsCsv(customerId: string): string;
/** Brother b-PAC / P-touch 向け CSV */
export declare function buildBrotherLabelsCsv(customerId: string): string;
/** QR 中心 SVG（ラベルプリンタ / 現場印刷用） */
export declare function buildDeviceQrSvg(customerId: string, deviceId: string): string;
