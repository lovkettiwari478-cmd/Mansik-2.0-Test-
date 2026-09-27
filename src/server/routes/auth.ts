import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { getDb } from '../db/index.js';
import { config } from '../config.js';
import { hashPassword, verifyPassword } from '../lib/crypto.js';
import { AuditLogger } from '../core/auditLogger.js';

const router = Router();

// Rate limiter for auth endpoints - stricter, per-email+IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.nodeEnv === 'test' ? 100 : config.rateLimit.authMax,
  message: { error: 'Too many authentication attempts, try again later', code: 'AUTH_RATE_LIMITED' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => {
    const email = req.body?.email ? `:${req.body.email.toLowerCase()}` : '';
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    return `auth:${ip}${email}`;
  }
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
  name: z.string().min(1).max(100)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

// Brute-force protection helpers
function getLockoutDuration(failedCount: number): number {
  // Returns duration in minutes
  if (failedCount >= 20) return 60;
  if (failedCount >= 15) return 30;
  if (failedCount >= 10) return 15;
  if (failedCount >= 5) return 5;
  return 0;
}

function checkAndHandleLockout(email: string): { locked: boolean; lockedUntil?: string; retryAfterSeconds?: number } {
  const db = getDb();
  const normalizedEmail = email.toLowerCase();
  const lockout = db.prepare('SELECT * FROM account_lockouts WHERE email = ?').get(normalizedEmail) as any;
  
  if (!lockout) return { locked: false };
  
  if (lockout.locked_until) {
    const lockedUntilDate = new Date(lockout.locked_until);
    if (lockedUntilDate > new Date()) {
      const retryAfter = Math.ceil((lockedUntilDate.getTime() - Date.now()) / 1000);
      return { locked: true, lockedUntil: lockout.locked_until, retryAfterSeconds: retryAfter };
    }
  }
  
  // Check if first failure is older than 15 minutes - reset window
  if (lockout.first_failed_at) {
    const firstFailed = new Date(lockout.first_failed_at);
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    if (firstFailed < fifteenMinutesAgo) {
      // Reset - window expired
      db.prepare('DELETE FROM account_lockouts WHERE email = ?').run(normalizedEmail);
      return { locked: false };
    }
  }
  
  return { locked: false };
}

function recordFailedAttempt(email: string, ip: string | undefined, userAgent: string | undefined) {
  const db = getDb();
  const normalizedEmail = email.toLowerCase();
  const now = new Date().toISOString();
  const id = uuidv4();
  
  // Record attempt
  try {
    db.prepare('INSERT INTO login_attempts (id, email, ip_address, attempted_at, success, user_agent) VALUES (?, ?, ?, ?, 0, ?)').run(
      id, normalizedEmail, ip || 'unknown', now, userAgent || 'unknown'
    );
  } catch {}
  
  // Update or create lockout
  const existing = db.prepare('SELECT * FROM account_lockouts WHERE email = ?').get(normalizedEmail) as any;
  
  if (!existing) {
    db.prepare('INSERT INTO account_lockouts (email, failed_count, first_failed_at, last_failed_at, updated_at) VALUES (?, 1, ?, ?, ?)').run(
      normalizedEmail, now, now, now
    );
  } else {
    // Check if window expired
    const firstFailed = existing.first_failed_at ? new Date(existing.first_failed_at) : new Date();
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    let newCount: number;
    let firstFailedAt: string;
    
    if (firstFailed < fifteenMinutesAgo) {
      // Reset window
      newCount = 1;
      firstFailedAt = now;
    } else {
      newCount = existing.failed_count + 1;
      firstFailedAt = existing.first_failed_at;
    }
    
    const lockDurationMinutes = getLockoutDuration(newCount);
    let lockedUntil: string | null = null;
    
    if (lockDurationMinutes > 0) {
      lockedUntil = new Date(Date.now() + lockDurationMinutes * 60 * 1000).toISOString();
    }
    
    if (lockedUntil) {
      db.prepare('UPDATE account_lockouts SET failed_count = ?, last_failed_at = ?, locked_until = ?, updated_at = ? WHERE email = ?').run(
        newCount, now, lockedUntil, now, normalizedEmail
      );
    } else {
      db.prepare('UPDATE account_lockouts SET failed_count = ?, last_failed_at = ?, first_failed_at = ?, updated_at = ? WHERE email = ?').run(
        newCount, now, firstFailedAt, now, normalizedEmail
      );
    }
    
    // Audit lockout event if locked
    if (lockedUntil) {
      AuditLogger.log({
        userId: 'unknown',
        action: 'login_lockout',
        resource: 'account',
        resourceId: normalizedEmail,
        status: 'failure',
        requestId: 'system',
        ip: ip,
        details: { email: normalizedEmail, failedCount: newCount, lockedUntil, reason: 'brute_force_protection' },
        riskLevel: 'high'
      });
    }
  }
}

function recordSuccessfulAttempt(email: string, ip: string | undefined, userAgent: string | undefined) {
  const db = getDb();
  const normalizedEmail = email.toLowerCase();
  const now = new Date().toISOString();
  const id = uuidv4();
  
  try {
    db.prepare('INSERT INTO login_attempts (id, email, ip_address, attempted_at, success, user_agent) VALUES (?, ?, ?, ?, 1, ?)').run(
      id, normalizedEmail, ip || 'unknown', now, userAgent || 'unknown'
    );
  } catch {}
  
  // Reset lockout on success
  db.prepare('DELETE FROM account_lockouts WHERE email = ?').run(normalizedEmail);
  
  // Cleanup old attempts (older than 24h) occasionally
  try {
    db.prepare("DELETE FROM login_attempts WHERE attempted_at < datetime('now', '-1 day')").run();
  } catch {}
}

function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

router.get('/csrf', async (req, res) => {
  const token = generateCsrfToken();
  res.cookie('csrf_token', token, {
    httpOnly: false, // Must be readable by JS
    secure: config.isProduction,
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000, // 24h
    path: '/'
  });
  res.json({ csrfToken: token });
});

router.post('/register', authLimiter, async (req, res) => {
  try {
    const { email, password, name } = registerSchema.parse(req.body);
    
    const db = getDb();
    
    // Check existing
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as any;
    if (existing) {
      return res.status(400).json({ error: 'Email already registered', code: 'EMAIL_EXISTS' });
    }
    
    // Strong password check
    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      return res.status(400).json({ error: 'Password must contain uppercase, lowercase and number', code: 'WEAK_PASSWORD' });
    }
    
    const id = uuidv4();
    const passwordHash = await hashPassword(password);
    const now = new Date().toISOString();
    
    db.prepare('INSERT INTO users (id, email, password_hash, name, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, email.toLowerCase(), passwordHash, name, 'user', now, now);
    
    // Create session
    const sessionId = uuidv4();
    const token = jwt.sign({ userId: id, email: email.toLowerCase(), role: 'user', sessionId }, config.jwtSecret, { expiresIn: '7d' });
    
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    
    db.prepare('INSERT INTO sessions (id, user_id, token_hash, device_info, ip_address, created_at, expires_at, last_active_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      sessionId,
      id,
      token.slice(-20),
      req.headers['user-agent'] || 'unknown',
      req.ip || 'unknown',
      now,
      expiresAt,
      now
    );
    
    AuditLogger.log({
      userId: id,
      action: 'register',
      resource: 'user',
      resourceId: id,
      status: 'success',
      requestId: (req as any).requestId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      riskLevel: 'low'
    });
    
    const csrfToken = generateCsrfToken();
    
    res.cookie('token', token, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/'
    });
    
    res.cookie('csrf_token', csrfToken, {
      httpOnly: false,
      secure: config.isProduction,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/'
    });
    
    res.status(201).json({
      user: { id, email: email.toLowerCase(), name, role: 'user' },
      token,
      csrfToken,
      message: 'Registration successful'
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation failed', details: error.errors, code: 'VALIDATION_ERROR' });
    }
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed', code: 'INTERNAL_ERROR' });
  }
});

router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const normalizedEmail = email.toLowerCase();
    const db = getDb();
    
    // Check lockout first (for any email, to prevent enumeration)
    const lockoutCheck = checkAndHandleLockout(normalizedEmail);
    if (lockoutCheck.locked) {
      res.setHeader('Retry-After', lockoutCheck.retryAfterSeconds?.toString() || '300');
      AuditLogger.log({
        userId: 'unknown',
        action: 'login',
        resource: 'session',
        status: 'failure',
        requestId: (req as any).requestId,
        ip: req.ip,
        details: { email: normalizedEmail, reason: 'account_locked', lockedUntil: lockoutCheck.lockedUntil },
        riskLevel: 'high'
      });
      return res.status(429).json({ 
        error: 'Too many failed attempts, try again later', 
        code: 'ACCOUNT_LOCKED',
        retryAfter: lockoutCheck.retryAfterSeconds,
        lockedUntil: lockoutCheck.lockedUntil
      });
    }
    
    const user = db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(normalizedEmail) as any;
    
    if (!user) {
      recordFailedAttempt(normalizedEmail, req.ip, req.headers['user-agent']);
      AuditLogger.log({
        userId: 'unknown',
        action: 'login',
        resource: 'session',
        status: 'failure',
        requestId: (req as any).requestId,
        ip: req.ip,
        details: { email: normalizedEmail, reason: 'user_not_found' },
        riskLevel: 'medium'
      });
      // Do not reveal whether email exists
      return res.status(401).json({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
    }
    
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      recordFailedAttempt(normalizedEmail, req.ip, req.headers['user-agent']);
      AuditLogger.log({
        userId: user.id,
        action: 'login',
        resource: 'session',
        status: 'failure',
        requestId: (req as any).requestId,
        ip: req.ip,
        details: { reason: 'wrong_password' },
        riskLevel: 'medium'
      });
      return res.status(401).json({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
    }
    
    // Successful login - reset lockout
    recordSuccessfulAttempt(normalizedEmail, req.ip, req.headers['user-agent']);
    
    const sessionId = uuidv4();
    const token = jwt.sign({ userId: user.id, email: user.email, role: user.role, sessionId }, config.jwtSecret, { expiresIn: '7d' });
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    
    db.prepare('INSERT INTO sessions (id, user_id, token_hash, device_info, ip_address, created_at, expires_at, last_active_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      sessionId,
      user.id,
      token.slice(-20),
      req.headers['user-agent'] || 'unknown',
      req.ip || 'unknown',
      now,
      expiresAt,
      now
    );
    
    db.prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?').run(now, now, user.id);
    
    AuditLogger.log({
      userId: user.id,
      action: 'login',
      resource: 'session',
      resourceId: sessionId,
      status: 'success',
      requestId: (req as any).requestId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      riskLevel: 'low'
    });
    
    const csrfToken = generateCsrfToken();
    
    res.cookie('token', token, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/'
    });
    
    res.cookie('csrf_token', csrfToken, {
      httpOnly: false,
      secure: config.isProduction,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/'
    });
    
    res.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role, preferences: user.preferences ? JSON.parse(user.preferences) : {} },
      token,
      csrfToken,
      message: 'Login successful'
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/logout', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const tokenFromCookie = (req as any).cookies?.token;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : tokenFromCookie;
    
    if (token) {
      try {
        const payload = jwt.verify(token, config.jwtSecret) as any;
        const db = getDb();
        db.prepare("UPDATE sessions SET revoked_at = datetime('now') WHERE id = ?").run(payload.sessionId);
        
        AuditLogger.log({
          userId: payload.userId,
          action: 'logout',
          resource: 'session',
          resourceId: payload.sessionId,
          status: 'success',
          requestId: (req as any).requestId,
          ip: req.ip,
          riskLevel: 'low'
        });
      } catch {}
    }
    
    res.clearCookie('token', { path: '/' });
    res.clearCookie('csrf_token', { path: '/' });
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Logout failed' });
  }
});

router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const tokenFromCookie = (req as any).cookies?.token;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : tokenFromCookie;
    
    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const payload = jwt.verify(token, config.jwtSecret) as any;
    const db = getDb();
    const user = db.prepare('SELECT id, email, name, role, preferences, created_at FROM users WHERE id = ?').get(payload.userId) as any;
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    const session = db.prepare('SELECT revoked_at, expires_at FROM sessions WHERE id = ?').get(payload.sessionId) as any;
    if (!session || session.revoked_at || new Date(session.expires_at) < new Date()) {
      return res.status(401).json({ error: 'Session invalid' });
    }
    
    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        preferences: user.preferences ? JSON.parse(user.preferences) : {},
        createdAt: user.created_at
      }
    });
  } catch (error) {
    res.status(401).json({ error: 'Invalid session' });
  }
});

router.get('/sessions', async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  
  const db = getDb();
  const sessions = db.prepare('SELECT id, device_info, ip_address, created_at, expires_at, last_active_at, revoked_at FROM sessions WHERE user_id = ? ORDER BY last_active_at DESC LIMIT 20').all(userId) as any[];
  
  res.json({ sessions });
});

router.delete('/sessions/:id', async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  
  const db = getDb();
  const result = db.prepare("UPDATE sessions SET revoked_at = datetime('now') WHERE id = ? AND user_id = ?").run(req.params.id, userId);
  
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  AuditLogger.log({
    userId,
    action: 'revoke_session',
    resource: 'session',
    resourceId: req.params.id,
    status: 'success',
    requestId: (req as any).requestId,
    riskLevel: 'medium'
  });
  
  res.json({ message: 'Session revoked' });
});

export default router;
