import { applyPaymentStatusAfterRecord } from "./business-payment-status.js";
export interface BusinessPayment {
    id: string;
    projectId: string;
    invoiceId: string | null;
    amount: number;
    paymentDate: string;
    method: string;
    memo: string;
    createdAt: string;
}
export declare function createBusinessPayment(input: {
    projectId: string;
    invoiceId?: string | null;
    amount: number;
    paymentDate: string;
    method?: string;
    memo?: string;
}): BusinessPayment & {
    statusUpdate?: ReturnType<typeof applyPaymentStatusAfterRecord>;
};
export declare function listBusinessPayments(opts?: {
    projectId?: string;
}): BusinessPayment[];
export interface AccountingCsvRow {
    customerName: string;
    projectTitle: string;
    invoiceDate: string;
    paymentDate: string;
    subtotalExTax: number;
    tax: number;
    totalInTax: number;
    paidAmount: number;
    status: string;
}
export declare function buildAccountingExportCsv(): string;
export type AccountingCsvFormat = "standard" | "freee" | "yayoi";
export interface AccountingExportRow {
    date: string;
    partner: string;
    account: string;
    taxCategory: string;
    amount: number;
    tax: number;
    memo: string;
    projectId: string;
}
export declare function buildAccountingExportByFormat(format: AccountingCsvFormat): string;
