export interface SpecificationPhoto {
    url: string;
    title: string;
}
export interface SpecificationContext {
    addressee: string;
    subject: string;
    siteName: string;
    workLocation: string;
    issueDate: string;
    staffName: string;
    photos: SpecificationPhoto[];
}
export declare function renderSpecificationHtml(ctx: SpecificationContext): string;
