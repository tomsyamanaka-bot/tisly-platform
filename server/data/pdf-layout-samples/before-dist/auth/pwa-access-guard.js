import { canAccessPwa } from "../pwa/pwa-hub.js";
export function requirePwaAccess(pwaId) {
    return (req, res, next) => {
        const role = req.admin?.role ?? "viewer";
        if (!canAccessPwa(role, pwaId)) {
            res.status(403).json({
                error: "PWA access denied for this role",
                pwa: pwaId,
                role,
            });
            return;
        }
        next();
    };
}
