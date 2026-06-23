import type express from "express";

/** Merge query string from legacy URL into target, with optional overrides. */
export function mergeRedirectQuery(
  req: express.Request,
  targetPath: string,
  overrides: Record<string, string> = {}
): string {
  const q = new URLSearchParams(
    typeof req.query === "object" && req.query ? (req.query as Record<string, string>) : {}
  );
  for (const [key, value] of Object.entries(overrides)) {
    q.set(key, value);
  }
  const qs = q.toString();
  return qs ? `${targetPath}?${qs}` : targetPath;
}

export function registerPwaLegacyRedirects(app: express.Application): void {
  app.get("/estimate", (req, res) => {
    res.redirect(301, mergeRedirectQuery(req, "/estimate-v1"));
  });

  app.get("/invoice", (req, res) => {
    res.redirect(301, mergeRedirectQuery(req, "/estimate-v1", { tab: "invoice" }));
  });

  app.get("/drawing-editor", (req, res) => {
    res.redirect(301, mergeRedirectQuery(req, "/survey-drawing-v1"));
  });

  app.get("/survey", (req, res) => {
    res.redirect(301, mergeRedirectQuery(req, "/survey-v1"));
  });

  app.get("/projects", (req, res) => {
    res.redirect(301, mergeRedirectQuery(req, "/projects-v1"));
  });

  app.get("/materials", (req, res) => {
    res.redirect(301, mergeRedirectQuery(req, "/field-check-v1"));
  });

  app.get("/materials-v1", (req, res) => {
    res.redirect(301, mergeRedirectQuery(req, "/field-check-v1"));
  });

  app.get("/purchase", (req, res) => {
    res.redirect(301, mergeRedirectQuery(req, "/field-check-v1", { tab: "orders" }));
  });
}
