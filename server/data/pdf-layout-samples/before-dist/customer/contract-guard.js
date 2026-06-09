import { getDatabase } from "../db/database.js";
export function getContractStatus(customer) {
    const row = getDatabase()
        .prepare(`SELECT contract_status FROM customers WHERE customer_id = ?`)
        .get(customer.customer_id);
    const s = row?.contract_status ?? "active";
    if (s === "trial" || s === "active" || s === "suspended" || s === "cancelled") {
        return s;
    }
    return "active";
}
export function isContractRestricted(contract) {
    return contract === "suspended" || contract === "cancelled";
}
export function notificationsAllowedForContract(contract) {
    return contract === "trial" || contract === "active";
}
export function requireActiveContract(customer, res, mode = "write") {
    const contract = getContractStatus(customer);
    if (!isContractRestricted(contract))
        return true;
    const message = contract === "cancelled"
        ? "契約は解約済みです。閲覧のみ可能です。"
        : "契約は一時停止中です。管理者にお問い合わせください。";
    res.status(403).json({
        error: "Contract restriction",
        contractStatus: contract,
        mode,
        hint: message,
        adminWarning: `Customer ${customer.customer_code} is ${contract}`,
    });
    return false;
}
export function contractWarningBanner(customer) {
    const contract = getContractStatus(customer);
    if (contract === "suspended") {
        return "契約が一時停止中です。一部機能が制限されています。";
    }
    if (contract === "cancelled") {
        return "契約は解約済みです。閲覧のみ可能です。";
    }
    return null;
}
