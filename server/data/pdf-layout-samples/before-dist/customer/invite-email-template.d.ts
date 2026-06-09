export interface InviteEmailInput {
    customerName: string;
    customerCode: string;
    inviterName: string;
    role: string;
    expiresAt: string;
    inviteToken: string;
}
export declare function buildInviteAcceptUrl(customerCode: string, inviteToken: string): string;
export declare function buildInviteEmailSubject(input: InviteEmailInput): string;
export declare function buildInviteEmailHtml(input: InviteEmailInput): string;
export declare function buildInviteEmailText(input: InviteEmailInput): string;
/** Placeholder — wire to nodemailer in production. */
export declare function sendInviteEmailPlaceholder(to: string, input: InviteEmailInput): Promise<{
    sent: false;
    todo: string;
    subject: string;
    html: string;
}>;
