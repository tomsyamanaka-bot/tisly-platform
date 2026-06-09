/** 案件番号1つで現調→見積→施工→請求→入金を連動するためのチェーン管理 */
export interface ProjectCaseChain {
    id: string;
    caseNo: string;
    surveyProjectId: string | null;
    businessProjectId: string | null;
    customerCode: string | null;
    createdAt: string;
    updatedAt: string;
}
export declare function generateCaseNo(): string;
export declare function upsertProjectCaseChain(input: {
    caseNo?: string;
    surveyProjectId?: string | null;
    businessProjectId?: string | null;
    customerCode?: string | null;
}): ProjectCaseChain;
export declare function getCaseChainBySurveyId(surveyProjectId: string): ProjectCaseChain | null;
export declare function getCaseChainByBusinessId(businessProjectId: string): ProjectCaseChain | null;
