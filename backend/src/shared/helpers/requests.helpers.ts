import { IClientContext } from "@vault/modules/session";
import { RequestHandler, Request, Response } from "express";

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

export const handle = (fn: AsyncHandler): RequestHandler => (req, res, next) => fn(req, res).catch(next);

export const getClientContext = (req: Request): IClientContext => ({
    ip: req.ip ?? 'unknown',
    userAgent: req.get('user-agent') ?? '',
});