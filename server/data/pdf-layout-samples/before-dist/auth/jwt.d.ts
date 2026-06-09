export interface JwtPayload {
    sub: string;
    username: string;
    role: string;
    jti?: string;
    customerId?: string;
    customerCode?: string;
    scope?: "platform" | "customer";
}
export declare function signToken(payload: JwtPayload): {
    token: string;
    jti: string;
};
export declare function verifyToken(token: string): JwtPayload | null;
