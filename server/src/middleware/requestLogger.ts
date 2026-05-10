import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import logger from '../config/logger';

export const requestLogger = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const startTime = Date.now();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  
  req.requestId = requestId;

  const logData: any = {
    requestId,
    method: req.method,
    path: req.path,
    query: Object.keys(req.query).length > 0 ? req.query : undefined,
    ip: req.ip || req.socket.remoteAddress,
    userAgent: req.get('User-Agent')?.slice(0, 100),
  };

  if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
    const sanitizedBody = { ...req.body };
    if (sanitizedBody.password) sanitizedBody.password = '***';
    if (sanitizedBody.passwordHash) sanitizedBody.passwordHash = '***';
    if (sanitizedBody.token) sanitizedBody.token = '***';
    logData.body = sanitizedBody;
  }

  logger.info(`→ ${req.method} ${req.path}`, logData);

  const originalJson = res.json.bind(res);
  res.json = (body: any) => {
    const duration = Date.now() - startTime;
    const responseLog: any = {
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
    };
    
    if (req.user) {
      responseLog.userId = req.user.id;
      responseLog.userEmail = req.user.email;
    }

    if (res.statusCode >= 400) {
      responseLog.responseBody = body;
      logger.warn(`← ${req.method} ${req.path} ${res.statusCode} (${duration}ms)`, responseLog);
    } else {
      logger.info(`← ${req.method} ${req.path} ${res.statusCode} (${duration}ms)`, responseLog);
    }

    return originalJson(body);
  };

  next();
};
