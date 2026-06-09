export type GoogleOAuthMode = "mock" | "real";
export interface GoogleOAuthConfig {
    enabled: boolean;
    mode: GoogleOAuthMode;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    refreshToken: string | null;
}
export declare function getGoogleOAuthConfig(): GoogleOAuthConfig;
export declare function saveGoogleRefreshToken(token: string): void;
export declare function getGoogleOAuthStatus(): {
    enabled: boolean;
    mode: GoogleOAuthMode;
    connected: boolean;
    calendar: {
        provider: GoogleOAuthMode;
        ready: boolean;
    };
    gmail: {
        provider: GoogleOAuthMode;
        ready: boolean;
    };
    clientIdConfigured: boolean;
    redirectUri: string | null;
};
export declare function getGoogleAuthUrl(state?: string): {
    url: string;
    mode: GoogleOAuthMode;
};
export declare function refreshGoogleAccessToken(): Promise<string>;
export declare function handleGoogleOAuthCallback(input: {
    code?: string;
    error?: string;
}): Promise<{
    ok: boolean;
    mode: GoogleOAuthMode;
    message: string;
    refreshTokenSaved?: boolean;
}>;
export declare function testGoogleOAuthConnection(): Promise<{
    ok: boolean;
    mode: GoogleOAuthMode;
    calendar: string;
    gmail: string;
}>;
export interface GoogleCalendarCreateInput {
    projectId?: string;
    title: string;
    start: string;
    end: string;
    location?: string;
    description?: string;
}
export declare function createGoogleCalendarEvent(input: GoogleCalendarCreateInput): Promise<{
    mode: GoogleOAuthMode;
    eventId: string;
    htmlLink?: string;
}>;
export interface GmailDraftInput {
    projectId?: string;
    to: string;
    subject: string;
    body: string;
}
export declare function createGmailDraft(input: GmailDraftInput): Promise<{
    mode: GoogleOAuthMode;
    draftId: string;
    messageId?: string;
}>;
export declare function sendGmailPlaceholder(input: GmailDraftInput & {
    confirmed?: boolean;
}): Promise<{
    mode: GoogleOAuthMode;
    status: "skipped" | "sent" | "dry_run";
    message: string;
}>;
