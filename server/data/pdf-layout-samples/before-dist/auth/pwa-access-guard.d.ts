import type { NextFunction, Response } from "express";
import type { AuthedRequest } from "./auth-middleware.js";
import { type PwaAppId } from "../pwa/pwa-hub.js";
export declare function requirePwaAccess(pwaId: PwaAppId): (req: AuthedRequest, res: Response, next: NextFunction) => void;
