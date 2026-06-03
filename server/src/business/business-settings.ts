import { DEFAULT_MAIL_TO } from "./business-types.js";
import { getGoogleOAuthConfig, getGoogleOAuthStatus } from "../services/googleOAuthService.js";
import { getQnapUploadConfig } from "./services/qnapBusinessArchive.js";
import { getPdfRenderMode } from "./pdf/render.js";
import { getTomsCompanyInfo } from "./pdf/company.js";
import { getBusinessRealSendSettings } from "./business-real-send-guard.js";

export function getBusinessSettingsPayload() {
  const google = getGoogleOAuthStatus();
  const oauth = getGoogleOAuthConfig();
  const qnap = getQnapUploadConfig();
  const pdfMode = getPdfRenderMode();
  const company = getTomsCompanyInfo();
  const realSend = getBusinessRealSendSettings();
  return {
    googleOAuth: google,
    googleCalendar: {
      connected: google.calendar.ready,
      mode: oauth.mode,
      provider: oauth.mode === "mock" ? "MockGoogleCalendarProvider" : "GoogleCalendarApiProvider",
    },
    gmail: {
      connected: google.gmail.ready,
      mode: oauth.mode,
      defaultTo: process.env.BUSINESS_MAIL_TO ?? DEFAULT_MAIL_TO,
      provider: oauth.mode === "mock" ? "MockGmailProvider" : "GmailApiProvider",
    },
    qnap: {
      connected: qnap.mode === "mock" || Boolean(qnap.webdavUrl),
      mode: qnap.mode,
      baseRoot: qnap.basePath,
      webdavUrl: qnap.webdavUrl || null,
    },
    pdf: {
      mode: pdfMode,
      puppeteerAvailable: pdfMode === "puppeteer",
      templates: {
        estimate: "toms_standard_v2",
        invoice: "toms_standard_v2",
        completion_report: "toms_standard_v2",
      },
    },
    realSend,
    company,
    mailTo: process.env.BUSINESS_MAIL_TO ?? DEFAULT_MAIL_TO,
  };
}
