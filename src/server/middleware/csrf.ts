import { Request, Response, NextFunction } from 'express';

export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  // Skip for safe methods
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    return next();
  }
  
  // Skip if Authorization header present (Bearer token auth preferred)
  // Bearer auth is not vulnerable to CSRF
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return next();
  }
  
  // If no cookie token, auth middleware will handle 401 anyway
  // But we still want to check CSRF if cookie auth is attempted
  const tokenFromCookie = (req as any).cookies?.token;
  if (!tokenFromCookie) {
    return next();
  }
  
  // At this point, request is using cookie auth for state-changing operation
  // Require CSRF token
  const csrfCookie = (req as any).cookies?.csrf_token;
  const csrfHeader = req.headers['x-csrf-token'] as string || req.headers['x-xsrf-token'] as string;
  
  if (!csrfCookie) {
    return res.status(403).json({ 
      error: 'CSRF token missing - refresh and try again', 
      code: 'CSRF_MISSING' 
    });
  }
  
  if (!csrfHeader) {
    return res.status(403).json({ 
      error: 'CSRF header missing', 
      code: 'CSRF_HEADER_MISSING' 
    });
  }
  
  if (csrfCookie !== csrfHeader) {
    return res.status(403).json({ 
      error: 'CSRF token invalid', 
      code: 'CSRF_INVALID' 
    });
  }
  
  next();
}
