import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getTomsDocumentTemplate,
  listTomsDocumentTemplates,
  TOMS_DOCUMENT_TEMPLATES,
} from "../src/business/pdf/toms-document-templates.js";

describe("TOMS document template registry", () => {
  it("lists four templates (estimate, invoice, specification, completion)", () => {
    const ids = listTomsDocumentTemplates().map((t) => t.id);
    assert.deepEqual(ids.sort(), [
      "completion-report-template",
      "estimate-template",
      "invoice-template",
      "specification-template",
    ]);
  });

  it("estimate and invoice templates reference html-css engine and xlsx file names", () => {
    const est = getTomsDocumentTemplate("estimate-template");
    const inv = getTomsDocumentTemplate("invoice-template");
    assert.equal(est.engine, "html-css");
    assert.equal(inv.engine, "html-css");
    assert.match(est.excelTemplateFile ?? "", /\.xlsx$/);
    assert.match(inv.excelTemplateFile ?? "", /\.xlsx$/);
  });

  it("specification template label is 仕様書", () => {
    assert.equal(TOMS_DOCUMENT_TEMPLATES["specification-template"].label, "仕様書");
  });
});
