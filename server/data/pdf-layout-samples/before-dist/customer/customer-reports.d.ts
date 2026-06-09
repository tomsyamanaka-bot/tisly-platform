export declare function buildCustomerSalesReport(customerId: string): {
    period: {
        month: string;
        from: string;
        to: string;
    };
    monthlyEvents: number;
    alarmCount: number;
    recoveryCount: number;
    uptimePercent: number;
    aiComment: string;
    improvements: string[];
};
