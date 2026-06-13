import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { renderEstimateHtml } from "../dist/business/pdf/estimate-template.js";
import { renderInvoiceHtml } from "../dist/business/pdf/invoice-template.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "data", "pdf-verify");

const SAMPLE = {
  customerName: "株式会社伝元",
  subject: "換気扇設置工事",
  workLocation: "茨城県つくば市研究学園5-1",
};

const project = {
  id: "demo",
  projectNo: "PRJ-DEMO",
  customerId: "c1",
  customerName: SAMPLE.customerName,
  title: SAMPLE.subject,
  address: SAMPLE.workLocation,
  phone: "",
  status: "estimate_created",
  surveySchedule: null,
  surveyMemo: "納期2週間程度",
  surveyPhotos: [],
  estimateId: "e1",
  constructionSchedule: null,
  requiredMaterials: "",
  constructionMemo: "",
  constructionPhotos: [],
  completionReportId: null,
  invoiceId: "i1",
  paymentDueDate: null,
  paidDate: null,
  qnapBasePath: "",
  surveyProjectId: null,
  createdAt: "",
  updatedAt: "",
};

const items = [
  {
    id: "1",
    category: "other",
    name: "小上がり既存換気扇3台設置",
    memo: "清掃・修理配線",
    unit: "台",
    quantity: 3,
    unitPrice: 15000,
    amount: 45000,
  },
  {
    id: "2",
    category: "other",
    name: "試験・調整",
    memo: "",
    unit: "式",
    quantity: 1,
    unitPrice: 10000,
    amount: 10000,
  },
];

const estimate = {
  id: "e1",
  projectId: "demo",
  estimateNo: "260613-001",
  customerName: SAMPLE.customerName,
  title: SAMPLE.subject,
  items,
  shuseiDiscount: 0,
  shuseiDiscountMemo: "",
  subtotal: 55000,
  tax: 5500,
  total: 60500,
  internalCost: 0,
  grossProfit: 55000,
  grossProfitRate: 100,
  pdfPath: null,
  createdAt: "2026-06-13T00:00:00.000Z",
  updatedAt: "2026-06-13T00:00:00.000Z",
  header: {
    addressee: SAMPLE.customerName,
    subject: SAMPLE.subject,
    issueDate: "2026/06/13",
    estimateNo: "260613-001",
    staffName: "山中 智紀",
    workLocation: SAMPLE.workLocation,
  },
};

const invoice = {
  id: "i1",
  projectId: "demo",
  invoiceNo: "260613-001",
  customerName: SAMPLE.customerName,
  title: "KSフロンティア様",
  items,
  subtotal: 55000,
  tax: 5500,
  total: 60500,
  bankInfo: "みずほ銀行 守谷支店 普通 1234567 カ）トムス",
  pdfPath: null,
  createdAt: "2026-06-13T00:00:00.000Z",
  updatedAt: "2026-06-13T00:00:00.000Z",
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, "estimate-live.html"),
  renderEstimateHtml(project, estimate, { includePhotos: false }),
  "utf8"
);
fs.writeFileSync(
  path.join(outDir, "invoice-live.html"),
  renderInvoiceHtml(project, invoice, estimate),
  "utf8"
);
console.log("written", outDir);
