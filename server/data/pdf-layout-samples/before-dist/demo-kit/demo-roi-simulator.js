/**
 * Phase908 — ROI Simulator v2
 */
export function calculateRoiV2(input) {
    const siteCount = Math.max(1, Math.floor(input.siteCount ?? 1));
    const dispatchCount = Math.max(0, Math.floor(input.dispatchCountPerYear ?? 0));
    const labor = Math.max(0, Number(input.laborCostPerDispatch ?? 0));
    const vehicle = Math.max(0, Number(input.vehicleCostPerDispatch ?? 0));
    const reductionRate = Math.min(1, Math.max(0, Number(input.reductionRate ?? 0.65)));
    const costPerDispatch = labor + vehicle;
    const annualDispatchCost = dispatchCount * costPerDispatch * siteCount;
    const annualReductionJpy = Math.round(annualDispatchCost * reductionRate);
    const monthlyReductionJpy = Math.round(annualReductionJpy / 12);
    const chart = [
        { label: "現状（年間出動費）", value: annualDispatchCost },
        { label: "削減見込み", value: annualReductionJpy },
        { label: "導入後想定", value: Math.max(0, annualDispatchCost - annualReductionJpy) },
    ];
    return {
        input: { siteCount, dispatchCountPerYear: dispatchCount, laborCostPerDispatch: labor, vehicleCostPerDispatch: vehicle, reductionRate },
        costPerDispatch,
        annualDispatchCost,
        annualReductionJpy,
        monthlyReductionJpy,
        chart,
    };
}
