export interface TomsCompanyInfo {
  name: string;
  postalCode: string;
  address: string;
  phone: string;
  email: string;
  logoUrl: string;
  registrationNo: string;
}

export function getTomsCompanyInfo(): TomsCompanyInfo {
  return {
    name: process.env.TOMS_COMPANY_NAME ?? "{{TOMS_COMPANY_NAME}}",
    postalCode: process.env.TOMS_COMPANY_POSTAL ?? "{{POSTAL_CODE}}",
    address: process.env.TOMS_COMPANY_ADDRESS ?? "{{COMPANY_ADDRESS}}",
    phone: process.env.TOMS_COMPANY_PHONE ?? "{{COMPANY_PHONE}}",
    email: process.env.TOMS_COMPANY_EMAIL ?? "{{COMPANY_EMAIL}}",
    logoUrl: process.env.TOMS_LOGO_URL ?? "/assets/toms-logo-placeholder.svg",
    registrationNo: process.env.TOMS_REGISTRATION_NO ?? "{{REGISTRATION_NO}}",
  };
}
