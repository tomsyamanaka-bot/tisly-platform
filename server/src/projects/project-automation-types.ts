/** 案件自動化エンジン v1 — 型定義 */

export interface ProjectTemplateV1 {
  id: string;
  name: string;
  category: string;
  subCategory: string;
  description: string | null;
  active: boolean;
  sortOrder: number;
  taskCount: number;
  toolCount: number;
  photoCount: number;
  useCount?: number;
}

export interface ProjectTemplateDetailV1 extends ProjectTemplateV1 {
  tasks: TaskTemplateItemV1[];
  tools: ToolTemplateItemV1[];
  photos: PhotoTemplateItemV1[];
  specPhotos: SpecPhotoTemplateItemV1[];
}

export interface TaskTemplateItemV1 {
  id: string;
  projectTemplateId: string;
  label: string;
  sortOrder: number;
}

export interface ToolTemplateItemV1 {
  id: string;
  projectTemplateId: string;
  label: string;
  sortOrder: number;
}

export interface PhotoTemplateItemV1 {
  id: string;
  projectTemplateId: string;
  label: string;
  sortOrder: number;
}

export interface SpecPhotoTemplateItemV1 {
  id: string;
  projectTemplateId: string;
  label: string;
  sortOrder: number;
}

export interface ProjectTaskV1 {
  id: string;
  projectId: string;
  templateItemId: string | null;
  label: string;
  done: boolean;
  sortOrder: number;
  doneAt: string | null;
  memo: string | null;
}

export interface ProjectToolV1 {
  id: string;
  projectId: string;
  templateItemId: string | null;
  label: string;
  checked: boolean;
  sortOrder: number;
  checkedAt: string | null;
  memo: string | null;
  forgottenMemo: string | null;
}

export interface ProjectPhotoSlotV1 {
  id: string;
  projectId: string;
  templateItemId: string | null;
  label: string;
  photoPath: string | null;
  documentId: string | null;
  sortOrder: number;
  shotAt: string | null;
  shot: boolean;
  caption: string | null;
}

export interface SpecProjectPhotoSlotV1 {
  id: string;
  projectId: string;
  templateItemId: string | null;
  label: string;
  photoPath: string | null;
  documentId: string | null;
  sortOrder: number;
  shotAt: string | null;
  shot: boolean;
  caption: string | null;
}

export interface AutomationProgressV1 {
  tasks: { done: number; total: number; percent: number };
  tools: { checked: number; total: number; percent: number };
  photos: { shot: number; total: number; percent: number };
  specPhotos: { shot: number; total: number; percent: number };
  documents: { done: number; total: number; percent: number };
}

export interface ProjectAutomationBundleV1 {
  templateId: string | null;
  templateName: string | null;
  tasks: ProjectTaskV1[];
  tools: ProjectToolV1[];
  photos: ProjectPhotoSlotV1[];
  specPhotos: SpecProjectPhotoSlotV1[];
  progress: AutomationProgressV1;
  unshotPhotos: ProjectPhotoSlotV1[];
  unshotSpecPhotos: SpecProjectPhotoSlotV1[];
  suggestions?: AiSuggestionV1[];
}

export interface AiSuggestionV1 {
  id: string;
  projectId: string;
  suggestionType: string;
  label: string;
  detail: string | null;
  status: "pending" | "dismissed";
  createdAt: string;
}

export interface CompletionReportPhotoV1 {
  photoSlotId: string;
  photoSlotName: string;
  photoOrder: number;
  documentId: string | null;
  fileName: string | null;
  localPath: string | null;
  qnapPath: string | null;
  qnapStatus: string | null;
  caption: string | null;
  hasPhoto: boolean;
  missing: boolean;
}

export interface SpecificationPhotoV1 {
  photoSlotId: string;
  photoSlotName: string;
  photoOrder: number;
  documentId: string | null;
  fileName: string | null;
  localPath: string | null;
  qnapPath: string | null;
  qnapStatus: string | null;
  caption: string | null;
  hasPhoto: boolean;
  missing: boolean;
}

export interface ProjectTemplateAdminInputV1 {
  name: string;
  category?: string;
  subCategory?: string;
  description?: string | null;
  active?: boolean;
  sortOrder?: number;
}

export interface TemplateItemInputV1 {
  label: string;
  sortOrder?: number;
}
