export type LiveDeviceStatus = "ONLINE" | "WARNING" | "OFFLINE";
export interface ProjectLiveDevice {
    device_id: string;
    device_type: string;
    name: string;
    status: LiveDeviceStatus;
    last_seen: string | null;
    floor: string | null;
    zone: string | null;
    pos_x: number | null;
    pos_y: number | null;
    battery: number | null;
    rssi: number | null;
    firmware_version: string | null;
}
export declare function listProjectLiveDevices(projectId: string): ProjectLiveDevice[];
