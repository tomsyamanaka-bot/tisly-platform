export interface FieldLiveStatus {
    field_live_mode: boolean;
    mqtt_ack_required: boolean;
    cert_provisioning_mode: string;
    storage_provider: string;
    mqtt_mock_mode: boolean;
    mqtt_broker_configured: boolean;
    phase: string;
}
export declare function getFieldLiveStatus(): FieldLiveStatus;
