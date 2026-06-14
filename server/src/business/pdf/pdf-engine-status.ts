import fs from "fs";
import path from "path";
import { analyzePdfBuffer } from "./pdf-validation.js";
import { PUPPETEER_LAUNCH_ARGS, resolveChromiumExecutablePath } from "./chromium-path.js";

export interface PdfEngineHealthV1 {
  pdfEngine: "puppeteer" | "html_fallback";
  pdfEngineReady: boolean;
  chromiumExecutablePath: string | null;
  pdfLastError: string | null;
}

let lastProbe: PdfEngineHealthV1 = {
  pdfEngine: "html_fallback",
  pdfEngineReady: false,
  chromiumExecutablePath: null,
  pdfLastError: null,
};

let probePromise: Promise<PdfEngineHealthV1> | null = null;

function puppeteerInstalled(): boolean {
  if (process.env.TISLY_PDF_PUPPETEER === "false") return false;
  try {
    return fs.existsSync(path.join(process.cwd(), "node_modules", "puppeteer"));
  } catch {
    return false;
  }
}

export function getPdfEngineHealthSnapshot(): PdfEngineHealthV1 {
  return { ...lastProbe };
}

/** Puppeteer + Chromium が実際に PDF を生成できるかプローブ */
export async function probePdfEngineHealth(force = false): Promise<PdfEngineHealthV1> {
  if (!force && probePromise) return probePromise;

  probePromise = (async (): Promise<PdfEngineHealthV1> => {
    if (!puppeteerInstalled()) {
      lastProbe = {
        pdfEngine: "html_fallback",
        pdfEngineReady: false,
        chromiumExecutablePath: null,
        pdfLastError: "puppeteer not installed",
      };
      return { ...lastProbe };
    }

    const chromiumExecutablePath = resolveChromiumExecutablePath();
    if (!chromiumExecutablePath) {
      lastProbe = {
        pdfEngine: "html_fallback",
        pdfEngineReady: false,
        chromiumExecutablePath: null,
        pdfLastError: "Chromium executable not found (install chromium package on VPS)",
      };
      return { ...lastProbe };
    }

    try {
      const puppeteer = (await import("puppeteer" as string)) as {
        default: {
          launch: (opts: {
            headless: boolean | "shell";
            args: string[];
            executablePath: string;
          }) => Promise<{
            newPage: () => Promise<{
              setContent: (h: string, o: { waitUntil: string }) => Promise<void>;
              pdf: (o: { format: string; printBackground: boolean }) => Promise<Uint8Array>;
            }>;
            close: () => Promise<void>;
          }>;
        };
      };

      const browser = await puppeteer.default.launch({
        headless: true,
        args: PUPPETEER_LAUNCH_ARGS,
        executablePath: chromiumExecutablePath,
      });
      try {
        const page = await browser.newPage();
        await page.setContent(
          "<!DOCTYPE html><html><body><h1>PDF probe</h1><p>TiSLY health check</p></body></html>",
          { waitUntil: "load" }
        );
        const buf = Buffer.from(
          await page.pdf({ format: "A4", printBackground: true })
        );
        const analysis = analyzePdfBuffer(buf);
        if (!analysis.valid) {
          throw new Error(
            `probe PDF invalid: size=${analysis.sizeBytes} pages=${analysis.pageCount}`
          );
        }
        lastProbe = {
          pdfEngine: "puppeteer",
          pdfEngineReady: true,
          chromiumExecutablePath,
          pdfLastError: null,
        };
      } finally {
        await browser.close();
      }
    } catch (e) {
      lastProbe = {
        pdfEngine: "html_fallback",
        pdfEngineReady: false,
        chromiumExecutablePath,
        pdfLastError: e instanceof Error ? e.message : String(e),
      };
    }

    return { ...lastProbe };
  })();

  try {
    return await probePromise;
  } finally {
    probePromise = null;
  }
}

export function notePdfGenerationError(message: string): void {
  lastProbe = {
    ...lastProbe,
    pdfEngineReady: false,
    pdfEngine: "html_fallback",
    pdfLastError: message,
  };
}

export function notePdfGenerationSuccess(executablePath?: string | null): void {
  lastProbe = {
    pdfEngine: "puppeteer",
    pdfEngineReady: true,
    chromiumExecutablePath: executablePath ?? lastProbe.chromiumExecutablePath,
    pdfLastError: null,
  };
}
