export function getTomsCompanyInfo() {
    return {
        name: process.env.TOMS_COMPANY_NAME ?? "株式会社 TOMS",
        postalCode: process.env.TOMS_COMPANY_POSTAL ?? "302-0102",
        address: process.env.TOMS_COMPANY_ADDRESS ?? "茨城県守谷市松前台7丁目24番地9",
        phone: process.env.TOMS_COMPANY_PHONE ?? "080-2710-4483",
        email: process.env.TOMS_COMPANY_EMAIL ?? "",
        logoUrl: process.env.TOMS_LOGO_URL ?? "/assets/toms-logo-placeholder.svg",
        registrationNo: process.env.TOMS_REGISTRATION_NO ?? "T-2030001139320",
        representativeName: process.env.TOMS_REPRESENTATIVE_NAME ?? "山中 智紀",
    };
}
