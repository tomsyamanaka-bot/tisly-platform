import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { roleMeetsRequirement } from "../../auth/roles.js";
import { createFieldProject, getFieldProject } from "../../field/field-project-store.js";
import type { FieldProjectInput } from "../../field/field-project-types.js";

export const fieldRouter = Router();

const fieldAuth = [requireAuth("surveyor")] as const;

fieldRouter.post("/projects/create", ...fieldAuth, (req: AuthedRequest, res) => {
  const role = req.admin?.role ?? "viewer";
  if (!roleMeetsRequirement(role, "surveyor") && role !== "super_admin") {
    res.status(403).json({ error: "Surveyor or admin role required" });
    return;
  }

  const body = req.body as Partial<FieldProjectInput>;
  if (!body.customerName?.trim() || !body.address?.trim()) {
    res.status(400).json({ error: "customerName and address required" });
    return;
  }
  if (!body.scheduledDate?.trim() || !body.surveyStaff?.trim()) {
    res.status(400).json({ error: "scheduledDate and surveyStaff required" });
    return;
  }

  try {
    const project = createFieldProject({
      customerCode: body.customerCode,
      customerName: body.customerName.trim(),
      address: body.address.trim(),
      buildingType: body.buildingType ?? "detached_house",
      planCandidates: Array.isArray(body.planCandidates) ? body.planCandidates : ["standard"],
      surveyStaff: body.surveyStaff.trim(),
      scheduledDate: body.scheduledDate.trim(),
      memo: body.memo ?? "",
    });
    res.status(201).json({
      phase: "1161-1200",
      fieldProject: project,
      surveyProjectId: project.surveyProjectId,
      businessProjectId: project.businessProjectId,
      links: {
        survey: `/survey?projectId=${project.surveyProjectId}`,
        business: `/business/projects/${project.businessProjectId}`,
        timeline: `/api/timeline?projectId=${project.businessProjectId}`,
      },
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

fieldRouter.get("/projects/:id", ...fieldAuth, (req: AuthedRequest, res) => {
  const project = getFieldProject(String(req.params.id));
  if (!project) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ phase: "1161-1200", fieldProject: project });
});
