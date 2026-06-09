import { Router } from "express";
import { requireAuth } from "../../auth/auth-middleware.js";
import { roleMeetsRequirement } from "../../auth/roles.js";
import { practicalSearchV1 } from "../../search/practical-search-v1.js";
export const searchV1Router = Router();
const auth = [requireAuth("surveyor")];
function assertRole(req, res) {
    const role = req.admin?.role ?? "viewer";
    if (!roleMeetsRequirement(role, "surveyor") && role !== "super_admin") {
        res.status(403).json({ error: "Surveyor or admin role required" });
        return false;
    }
    return true;
}
searchV1Router.get("/", ...auth, (req, res) => {
    if (!assertRole(req, res))
        return;
    const q = String(req.query.q ?? "");
    res.json({ query: q, hits: practicalSearchV1(q) });
});
