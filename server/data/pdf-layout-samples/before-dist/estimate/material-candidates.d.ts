/** 現調カテゴリから見積部材候補を自動提示 */
import { type SurveyMaterialCategory } from "../survey/survey-v1-types.js";
export interface MaterialCandidateGroup {
    category: SurveyMaterialCategory;
    label: string;
    items: string[];
}
export declare function buildMaterialCandidatesForSurvey(surveyProjectId: string): MaterialCandidateGroup[];
export declare function listAllMaterialCandidatePresets(): MaterialCandidateGroup[];
