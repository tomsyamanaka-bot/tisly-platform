export interface TomsCompanyInfo {
    name: string;
    postalCode: string;
    address: string;
    phone: string;
    email: string;
    logoUrl: string;
    registrationNo: string;
    representativeName: string;
}
export declare function getTomsCompanyInfo(): TomsCompanyInfo;
