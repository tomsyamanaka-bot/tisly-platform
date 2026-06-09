import type { NextFunction, Response } from "express";
import type { AuthedRequest } from "./auth-middleware.js";
export declare function rejectInstallerRestricted(req: AuthedRequest, res: Response, next: NextFunction): void;
