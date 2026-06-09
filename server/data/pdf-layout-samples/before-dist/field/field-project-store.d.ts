import type { FieldProjectInput, FieldProjectRecord } from "./field-project-types.js";
export declare function createFieldProject(input: FieldProjectInput): FieldProjectRecord;
export declare function getFieldProject(id: string): FieldProjectRecord | null;
export declare function getFieldProjectBySurveyId(surveyProjectId: string): FieldProjectRecord | null;
export declare function getFieldProjectByBusinessId(businessProjectId: string): FieldProjectRecord | null;
