/** 見積・請求の将来検索用メタデータ */
export function buildPracticalSearchIndex(project, estimate, header, invoice, ctx) {
    return {
        estimateNo: header?.estimateNo ?? estimate.estimateNo ?? "",
        invoiceNo: invoice?.invoiceNo ?? null,
        addressee: header?.addressee ?? estimate.customerName ?? "",
        clientName: project.customerName ?? "",
        siteName: ctx?.siteName ?? header?.siteName ?? project.title ?? "",
        workLocation: header?.workLocation ?? project.address ?? "",
        contactName: ctx?.contactName ?? header?.staffName ?? "",
        phone: header?.phone ?? project.phone ?? "",
        email: header?.email ?? "",
        subject: header?.subject ?? estimate.title ?? "",
        createdAt: estimate.createdAt,
        updatedAt: estimate.updatedAt,
        total: estimate.total,
    };
}
