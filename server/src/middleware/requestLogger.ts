import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import logger from '../config/logger';

/**
 * Detailed HTTP request/response logging middleware.
 * Logs every request with method, path, status, duration, and user context.
 */
export const requestLogger = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const startTime = Date.now();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  
  // Attach request ID for correlation
  req.requestId = requestId;

  // Log incoming request
  const logData: any = {
    requestId,
    method: req.method,
    path: req.path,
    query: Object.keys(req.query).length > 0 ? req.query : undefined,
    ip: req.ip || req.socket.remoteAddress,
    userAgent: req.get('User-Agent')?.slice(0, 100),
  };

  // Log body for POST/PUT/PATCH (but mask sensitive fields)
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
    const sanitizedBody = { ...req.body };
    // Mask sensitive fields
    if (sanitizedBody.password) sanitizedBody.password = '***';
    if (sanitizedBody.passwordHash) sanitizedBody.passwordHash = '***';
    if (sanitizedBody.token) sanitizedBody.token = '***';
    logData.body = sanitizedBody;
  }

  logger.info(`→ ${req.method} ${req.path}`, logData);

  // Capture response
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
    
    // Log auth context if available
    if (req.user) {
      responseLog.userId = req.user.id;
      responseLog.userEmail = req.user.email;
    }

    // Log error responses with body
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
