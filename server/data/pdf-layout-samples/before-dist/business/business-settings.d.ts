export declare function getBusinessSettingsPayload(): {
    googleOAuth: {
        enabled: boolean;
        mode: import("../services/googleOAuthService.js").GoogleOAuthMode;
        connected: boolean;
        calendar: {
            provider: import("../services/googleOAuthService.js").GoogleOAuthMode;
            ready: boolean;
        };
        gmail: {
            provider: import("../services/googleOAuthService.js").GoogleOAuthMode;
            ready: boolean;
        };
        clientIdConfigured: boolean;
        redirectUri: string | null;
    };
    googleCalendar: {
        connected: boolean;
        mode: import("../services/googleOAuthService.js").GoogleOAuthMode;
        provider: string;
    };
    gmail: {
        connected: boolean;
        mode: import("../services/googleOAuthService.js").GoogleOAuthMode;
        sendMode: import("./services/gmailRealSend.js").GmailSendMode;
        defaultTo: any;
        provider: string;
    };
    qnap: {
        connected: boolean;
        mode: import("./services/qnapBusinessArchive.js").QnapUploadMode;
        baseRoot: string;
        webdavUrl: string | null;
    };
    pdf: {
        mode: import("./pdf/render.js").PdfRenderMode;
        puppeteerAvailable: boolean;
        templates: {
            estimate: string;
            invoice: string;
            completion_report: string;
        };
    };
    realSend: import("./business-real-send-guard.js").BusinessRealSendSettings;
    company: import("./pdf/company.js").TomsCompanyInfo;
    mailTo: any;
};
