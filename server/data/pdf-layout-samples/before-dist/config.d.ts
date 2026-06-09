export declare const config: {
    nodeEnv: string;
    port: number;
    host: string;
    readonly publicUrl: string;
    readonly dbPath: string;
    defaultTenantId: string;
    readonly ingestSecret: string;
    mqtt: {
        readonly mode: "mock" | "real";
        url: string;
        username: string;
        password: string;
        topicPrefix: string;
        clientId: string;
    };
    vapid: {
        readonly publicKey: string;
        readonly privateKey: string;
        readonly subject: string;
    };
    discord: {
        readonly webhookUrl: string;
    };
    smtp: {
        host: string;
        port: number;
        user: string;
        pass: string;
        from: string;
        adminEmail: string;
    };
    heartbeat: {
        warnSec: number;
        alarmSec: number;
    };
    readonly demoMode: boolean;
    readonly demoAutoStart: boolean;
    qnap: {
        readonly mode: "mock" | "real";
        host: string;
        share: string;
        username: string;
        password: string;
        basePath: string;
    };
    rc1Phase: string;
    readonly dbProvider: "sqlite" | "postgres";
    postgres: {
        host: string;
        port: number;
        database: string;
        user: string;
        password: string;
        ssl: boolean;
    };
    readonly rateLimitProvider: "memory" | "redis";
    redis: {
        url: string;
    };
    security: {
        readonly signatureCheckEnabled: boolean;
        readonly replayProtectionEnabled: boolean;
        readonly siemExportEnabled: boolean;
        signatureMaxAgeSec: number;
    };
    auth: {
        readonly jwtSecret: string;
        readonly adminUsername: string;
        readonly adminPasswordHash: string;
        readonly sessionExpiresMinutes: number;
        readonly require2fa: boolean;
        readonly customerLoginLockMinutes: number;
        readonly customerLoginMaxAttempts: number;
    };
    siem: {
        readonly provider: "none" | "loki" | "elastic" | "syslog";
        lokiUrl: string;
        elasticUrl: string;
        elasticIndex: string;
        syslogHost: string;
        syslogPort: number;
    };
    tv: {
        readonly certPinningEnabled: boolean;
        readonly certFingerprint: string;
    };
    infrastructure: {
        readonly vpsLabel: string;
        readonly nodeRedUrl: string;
    };
    storage: {
        readonly provider: "local" | "s3";
        s3: {
            endpoint: string;
            bucket: string;
            accessKey: string;
            secretKey: string;
        };
    };
    readonly mqttUrlConfigured: boolean;
    shelly: {
        readonly mode: "mock" | "real";
        baseUrl: string;
        authToken: string;
    };
    demoReset: {
        readonly enabled: boolean;
        cronExpr: string;
        timezone: string;
    };
    field: {
        readonly liveMode: boolean;
        readonly mqttAckRequired: boolean;
        readonly certProvisioningMode: "mock" | "ca" | "acme";
    };
    lock: {
        readonly provider: "mock" | "switchbot" | "sesame";
    };
    switchbot: {
        readonly mode: "mock" | "real" | "dryRun";
        readonly token: string;
        readonly secret: string;
        readonly lockDeviceId: string;
        readonly autoArmEnabled: boolean;
        readonly autoDisarmEnabled: boolean;
        readonly pollIntervalMs: number;
        readonly focusCustomerCode: string;
    };
    remoteTest: {
        readonly token: string;
    };
    securityAutomation: {
        readonly eventLogEnabled: boolean;
        readonly unknownDevicePolicy: "unknown_as_away" | "unknown_as_home" | "block_auto_arm";
        readonly unlockCooldownSec: number;
    };
};
