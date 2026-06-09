import { v4 as uuid } from "uuid";
export class MockGoogleCalendarProvider {
    async createEvent(draft) {
        return { externalId: `mock-gcal-${draft.id}`, status: "draft" };
    }
}
let calendarProvider = new MockGoogleCalendarProvider();
export function setGoogleCalendarProvider(provider) {
    calendarProvider = provider;
}
export function getGoogleCalendarProvider() {
    return calendarProvider;
}
function scheduleStartEnd(date, startTime, endTime) {
    const d = date ?? new Date().toISOString().slice(0, 10);
    const start = `${d}T${startTime ?? "09:00"}:00`;
    const end = `${d}T${endTime ?? "17:00"}:00`;
    return { start, end };
}
async function finalizeDraft(draft) {
    await calendarProvider.createEvent(draft);
    return draft;
}
export function createSiteSurveyCalendarDraft(project) {
    return createSurveyCalendarDraft(project);
}
export function createSurveyCalendarDraft(project) {
    const sched = project.surveySchedule;
    const { start, end } = scheduleStartEnd(sched?.date, sched?.startTime, sched?.endTime);
    return {
        id: uuid(),
        projectId: project.id,
        type: "survey",
        title: `現調: ${project.title}`,
        start,
        end,
        location: project.address,
        description: [
            `案件番号: ${project.projectNo}`,
            `お客様: ${project.customerName}`,
            `電話: ${project.phone}`,
            sched?.memo ? `メモ: ${sched.memo}` : "",
            project.surveyMemo ? `現調メモ: ${project.surveyMemo}` : "",
            "— Google Calendar mock (Phase541+)",
        ]
            .filter(Boolean)
            .join("\n"),
        status: "draft",
        createdAt: new Date().toISOString(),
    };
}
export function createConstructionCalendarDraft(project) {
    const sched = project.constructionSchedule;
    const { start, end } = scheduleStartEnd(sched?.date, sched?.startTime, sched?.endTime);
    return {
        id: uuid(),
        projectId: project.id,
        type: "construction",
        title: `工事: ${project.title}`,
        start,
        end,
        location: project.address,
        description: [
            `案件番号: ${project.projectNo}`,
            `お客様: ${project.customerName}`,
            `住所: ${project.address}`,
            `工事内容: ${project.title}`,
            project.requiredMaterials ? `必要部材:\n${project.requiredMaterials}` : "",
            project.constructionMemo ? `注意点:\n${project.constructionMemo}` : "",
            "— Google Calendar mock (Phase541+)",
        ]
            .filter(Boolean)
            .join("\n"),
        status: "draft",
        createdAt: new Date().toISOString(),
    };
}
export function createPaymentCalendarDraft(project) {
    const due = project.paymentDueDate ?? new Date().toISOString().slice(0, 10);
    return {
        id: uuid(),
        projectId: project.id,
        type: "payment",
        title: `入金予定: ${project.customerName} — ${project.title}`,
        start: `${due}T09:00:00`,
        end: `${due}T10:00:00`,
        location: "",
        description: [
            `案件番号: ${project.projectNo}`,
            `お客様: ${project.customerName}`,
            `入金予定日: ${due}`,
            project.invoiceId ? `請求書ID: ${project.invoiceId}` : "",
            "— Google Calendar mock (Phase541+)",
        ]
            .filter(Boolean)
            .join("\n"),
        status: "draft",
        createdAt: new Date().toISOString(),
    };
}
export async function syncCalendarDraftToGoogle(draft) {
    return finalizeDraft(draft);
}
