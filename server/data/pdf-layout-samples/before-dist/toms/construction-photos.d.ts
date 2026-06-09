import type { ConstructionPhotoCategory } from "./toms-types.js";
export interface ConstructionPhoto {
    id: string;
    projectId: string;
    category: ConstructionPhotoCategory | string;
    filePath: string;
    autoClassified: boolean;
    caption: string;
    createdAt: string;
}
export declare function classifyPhotoCategory(filename: string, caption?: string): ConstructionPhotoCategory;
export declare function saveConstructionPhoto(input: {
    projectId: string;
    buffer: Buffer;
    originalName: string;
    caption?: string;
    category?: ConstructionPhotoCategory | string;
}): ConstructionPhoto;
export declare function listConstructionPhotos(projectId: string): ConstructionPhoto[];
