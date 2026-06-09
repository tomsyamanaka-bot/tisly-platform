export declare function surveyAudioDir(projectId: string): string;
export declare function surveySketchDir(projectId: string): string;
export declare function saveSurveyAudio(params: {
    projectId: string;
    audioBase64: string;
    fileName?: string;
    mimeType?: string;
    durationSec?: number;
    transcript?: string;
    uploadedBy?: string;
}): {
    id: string;
    url: string;
    durationSec: number | null;
};
export declare function listSurveyAudio(projectId: string): {
    id: string;
    url: string;
    mimeType: string | null;
    durationSec: number | null;
    transcript: string | null;
    uploadedBy: string | null;
    createdAt: string;
}[];
export declare function saveSurveySketch(params: {
    projectId: string;
    imageBase64: string;
    uploadedBy?: string;
}): {
    id: string;
    url: string;
};
export declare function listSurveySketches(projectId: string): {
    id: string;
    url: string;
    uploadedBy: string | null;
    createdAt: string;
}[];
/** Rule-based reverse geocode (offline-safe for field use). */
export declare function reverseGeocodeAddress(lat: number, lng: number): {
    address: string;
    prefecture: string;
    city: string;
    source: "nominatim" | "rule-based";
};
