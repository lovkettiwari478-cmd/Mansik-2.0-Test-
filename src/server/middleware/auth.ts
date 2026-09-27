import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { getDb } from '../db/index.js';

export interface AuthRequest extends Request {
  user?: { id: string; email: string; role: string };
  requestId?: string;
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const tokenFromCookie = (req as any).cookies?.token;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : tokenFromCookie;
  
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized', code: 'NO_TOKEN' });
  }
  
  try {
    const payload = jwt.verify(token, config.jwtSecret) as any;
    
    // Check if session is revoked
    const db = getDb();
    const session = db.prepare('SELECT revoked_at, expires_at FROM sessions WHERE id = ?').get(payload.sessionId) as any;
    
    if (!session) {
      return res.status(401).json({ error: 'Session not found', code: 'SESSION_NOT_FOUND' });
    }
    
    if (session.revoked_at) {
      return res.status(401).json({ error: 'Session revoked', code: 'SESSION_REVOKED' });
    }
    
    if (new Date(session.expires_at) < new Date()) {
      return res.status(401).json({ error: 'Session expired', code: 'SESSION_EXPIRED' });
    }
    
    // Update last active
    db.prepare("UPDATE sessions SET last_active_at = datetime('now') WHERE id = ?").run(payload.sessionId);
    
    req.user = { id: payload.userId, email: payload.email, role: payload.role };
    next();
  } catch (err: any) {
    // Don't leak internal errors, but log for observability
    console.error('Auth middleware error:', err.message);
    return res.status(401).json({ error: 'Invalid token', code: 'INVALID_TOKEN' });
  }
}

export function optionalAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const tokenFromCookie = (req as any).cookies?.token;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : tokenFromCookie;
  
  if (!token) {
    return next();
  }
  
  try {
    const payload = jwt.verify(token, config.jwtSecret) as any;
    const db = getDb();
    const session = db.prepare('SELECT revoked_at, expires_at FROM sessions WHERE id = ?').get(payload.sessionId) as any;
    
    if (session && !session.revoked_at && new Date(session.expires_at) > new Date()) {
      req.user = { id: payload.userId, email: payload.email, role: payload.role };
    }
  } catch {}
  
  next();
}

export function adminOnly(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: admin only', code: 'FORBIDDEN' });
  }
  next();
}
