import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { config } from './config.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { authMiddleware } from './middleware/auth.js';
import { csrfProtection } from './middleware/csrf.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

import authRoutes from './routes/auth.js';
import chatRoutes from './routes/chat.js';
import memoryRoutes from './routes/memory.js';
import taskRoutes from './routes/tasks.js';
import systemRoutes from './routes/system.js';
import calendarRoutes from './routes/calendar.js';
import knowledgeRoutes from './routes/knowledge.js';
import toolsRoutes from './routes/tools.js';
import agentsRoutes from './routes/agents.js';
import integrationsRoutes from './routes/integrations.js';

// Helper to create rate limiters with user-aware key
function createRateLimiter(options: { windowMs: number; max: number; message?: any; keyPrefix?: string }) {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    message: options.message || { error: 'Too many requests, try again later', code: 'RATE_LIMITED' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: any) => {
      // Prefer user ID if authenticated, else IP
      if (req.user?.id) {
        return `${options.keyPrefix || 'rl'}:${req.user.id}`;
      }
      // Use IP, but handle proxy
      return `${options.keyPrefix || 'rl'}:${req.ip || req.headers['x-forwarded-for'] || 'unknown'}`;
    },
    // Skip successful health checks from counting too heavily
    skip: (req) => {
      // Skip health endpoint from rate limiting
      if (req.path === '/api/health') return true;
      return false;
    }
  });
}

export function createApp() {
  const app = express();
  
  // Trust proxy for correct IP when behind reverse proxy (Fly, Render, etc.)
  app.set('trust proxy', 1);
  
  // Security headers - hardened Helmet config
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // Vite needs unsafe-inline for dev
        styleSrc: ["'self'", "'unsafe-inline'", "https:"],
        imgSrc: ["'self'", "data:", "https:", "blob:"],
        connectSrc: ["'self'", "https:", "wss:"],
        fontSrc: ["'self'", "data:", "https:"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: false, // Allow embedding for flexibility
    crossOriginOpenerPolicy: { policy: "same-origin" },
    crossOriginResourcePolicy: { policy: "cross-origin" },
    dnsPrefetchControl: { allow: false },
    frameguard: { action: 'deny' },
    hidePoweredBy: true,
    hsts: config.isProduction ? {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true
    } : false,
    ieNoOpen: true,
    noSniff: true,
    originAgentCluster: true,
    permittedCrossDomainPolicies: false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    xssFilter: true
  }));
  
  // Additional security headers not covered by Helmet
  app.use((req, res, next) => {
    // Permissions Policy
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    // Extra hardening
    if (config.isProduction) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }
    next();
  });
  
  app.use(cors({
    origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',').map(o => o.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-XSRF-Token', 'X-Requested-With', 'X-Request-Id']
  }));
  
  app.use(cookieParser());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(requestIdMiddleware);
  
  // Rate limiting - endpoint specific
  // In test env, use much higher limits to avoid test interference
  const isTest = config.nodeEnv === 'test';
  
  const globalLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: isTest ? 10000 : config.rateLimit.apiMax,
    keyPrefix: 'global'
  });
  
  // Auth limiter - stricter but with email-aware key for login
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: config.nodeEnv === 'test' ? 100 : config.rateLimit.authMax,
    message: { error: 'Too many authentication attempts, try again later', code: 'AUTH_RATE_LIMITED' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: any) => {
      // For login, include email to isolate per-account
      const email = req.body?.email ? `:${req.body.email.toLowerCase()}` : '';
      const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
      return `auth:${ip}${email}`;
    }
  });
  
  const chatLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: isTest ? 1000 : config.rateLimit.chatMax,
    message: { error: 'Too many chat requests, please slow down', code: 'CHAT_RATE_LIMITED' },
    keyPrefix: 'chat'
  });
  
  const searchLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: isTest ? 1000 : config.rateLimit.searchMax,
    message: { error: 'Too many search requests', code: 'SEARCH_RATE_LIMITED' },
    keyPrefix: 'search'
  });
  
  const researchLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: isTest ? 1000 : config.rateLimit.researchMax,
    message: { error: 'Too many research requests', code: 'RESEARCH_RATE_LIMITED' },
    keyPrefix: 'research'
  });
  
  const uploadLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: isTest ? 1000 : config.rateLimit.uploadMax,
    message: { error: 'Too many uploads, try again later', code: 'UPLOAD_RATE_LIMITED' },
    keyPrefix: 'upload'
  });
  
  const taskLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: isTest ? 1000 : config.rateLimit.taskMax,
    message: { error: 'Too many task operations', code: 'TASK_RATE_LIMITED' },
    keyPrefix: 'task'
  });
  
  const systemLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: isTest ? 1000 : config.rateLimit.systemMax,
    message: { error: 'Too many system requests', code: 'SYSTEM_RATE_LIMITED' },
    keyPrefix: 'system'
  });
  
  // Apply global limiter to all API
  app.use('/api/', globalLimiter);
  
  // CSRF protection - must be after cookieParser, before routes
  // It will check cookie-based auth for state-changing operations
  app.use('/api/', csrfProtection);
  
  // Public routes - auth limiter applied inside authRoutes for login/register only
  app.use('/api/auth', authRoutes);
  
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), version: config.version });
  });
  
  // Protected routes with specific limiters
  app.use('/api/chat', authMiddleware, chatLimiter, chatRoutes);
  app.use('/api/memories', authMiddleware, (req, res, next) => {
    // Use search limiter for search endpoint, otherwise general
    if (req.path.includes('/search') && req.method === 'GET') {
      return searchLimiter(req, res, next);
    }
    next();
  }, memoryRoutes);
  app.use('/api/tasks', authMiddleware, taskLimiter, taskRoutes);
  app.use('/api/system', authMiddleware, systemLimiter, systemRoutes);
  app.use('/api/calendar', authMiddleware, calendarRoutes);
  app.use('/api/knowledge', authMiddleware, (req, res, next) => {
    if (req.path.includes('/upload') && req.method === 'POST') {
      return uploadLimiter(req, res, next);
    }
    if (req.path.includes('/search') && req.method === 'GET') {
      return searchLimiter(req, res, next);
    }
    next();
  }, knowledgeRoutes);
  app.use('/api/tools', authMiddleware, toolsRoutes);
  app.use('/api/agents', authMiddleware, (req, res, next) => {
    // Research and expensive operations
    if (req.path.includes('/research') || req.method === 'POST') {
      return researchLimiter(req, res, next);
    }
    next();
  }, agentsRoutes);
  app.use('/api/integrations', authMiddleware, integrationsRoutes);
  
  // Skills routes
  app.get('/api/skills', authMiddleware, async (req, res) => {
    const { SkillRegistry } = await import('./core/skillRegistry.js');
    const userId = (req as any).user.id;
    const skills = SkillRegistry.list(userId);
    res.json({ skills });
  });
  
  app.post('/api/skills', authMiddleware, async (req, res) => {
    const { SkillRegistry } = await import('./core/skillRegistry.js');
    const userId = (req as any).user.id;
    const { name, description, permissions, tools, config } = req.body;
    
    if (!name || !description) {
      return res.status(400).json({ error: 'name and description required' });
    }
    
    const skill = SkillRegistry.create(userId, { name, description, permissions: permissions || [], tools: tools || [], config });
    res.status(201).json({ skill });
  });
  
  app.put('/api/skills/:id', authMiddleware, async (req, res) => {
    const { SkillRegistry } = await import('./core/skillRegistry.js');
    const userId = (req as any).user.id;
    const skill = SkillRegistry.update(userId, req.params.id, req.body);
    
    if (!skill) {
      return res.status(404).json({ error: 'Skill not found or is system skill' });
    }
    
    res.json({ skill });
  });
  
  app.delete('/api/skills/:id', authMiddleware, async (req, res) => {
    const { SkillRegistry } = await import('./core/skillRegistry.js');
    const userId = (req as any).user.id;
    const success = SkillRegistry.delete(userId, req.params.id);
    
    if (!success) {
      return res.status(404).json({ error: 'Skill not found or is system skill' });
    }
    
    res.json({ message: 'Skill deleted' });
  });
  
  app.post('/api/skills/:id/toggle', authMiddleware, async (req, res) => {
    const { SkillRegistry } = await import('./core/skillRegistry.js');
    const userId = (req as any).user.id;
    const { enabled } = req.body;
    
    const success = SkillRegistry.toggle(userId, req.params.id, !!enabled);
    
    if (!success) {
      return res.status(404).json({ error: 'Skill not found' });
    }
    
    res.json({ message: `Skill ${enabled ? 'enabled' : 'disabled'}` });
  });
  
  // Research routes
  app.post('/api/research', authMiddleware, researchLimiter, async (req, res) => {
    const { ResearchEngine } = await import('./core/researchEngine.js');
    const { query, maxSources } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'query required' });
    }
    
    const result = await ResearchEngine.research(query, { maxSources });
    res.json({ result });
  });
  
  // Notifications
  app.get('/api/notifications', authMiddleware, async (req, res) => {
    const userId = (req as any).user.id;
    const { getDb } = await import('./db/index.js');
    const db = getDb();
    const notifications = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(userId);
    res.json({ notifications });
  });
  
  app.post('/api/notifications/:id/read', authMiddleware, async (req, res) => {
    const userId = (req as any).user.id;
    const { getDb } = await import('./db/index.js');
    const db = getDb();
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(req.params.id, userId);
    res.json({ message: 'Marked as read' });
  });
  
  // User preferences
  app.get('/api/user/preferences', authMiddleware, async (req, res) => {
    const userId = (req as any).user.id;
    const { getDb } = await import('./db/index.js');
    const db = getDb();
    const user = db.prepare('SELECT preferences FROM users WHERE id = ?').get(userId) as any;
    res.json({ preferences: user?.preferences ? JSON.parse(user.preferences) : {} });
  });
  
  app.put('/api/user/preferences', authMiddleware, async (req, res) => {
    const userId = (req as any).user.id;
    const { getDb } = await import('./db/index.js');
    const db = getDb();
    
    const existing = db.prepare('SELECT preferences FROM users WHERE id = ?').get(userId) as any;
    const currentPrefs = existing?.preferences ? JSON.parse(existing.preferences) : {};
    const newPrefs = { ...currentPrefs, ...req.body };
    
    db.prepare("UPDATE users SET preferences = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(newPrefs), userId);
    res.json({ preferences: newPrefs });
  });
  
  // Serve frontend static files in production
  const clientDistPath = path.resolve(process.cwd(), 'dist/client');
  
  // Try to serve built client, fallback to dev message
  app.use(express.static(clientDistPath, {
    maxAge: config.isProduction ? '1d' : 0,
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
      // Don't cache index.html
      if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
    }
  }));
  
  // SPA fallback - serve index.html for non-API routes
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      return next();
    }
    
    const indexPath = path.join(clientDistPath, 'index.html');
    res.sendFile(indexPath, (err) => {
      if (err) {
        // If no built client, serve a simple HTML
        res.send(`
          <!DOCTYPE html>
          <html>
            <head><title>MANISK OS</title><meta name="viewport" content="width=device-width, initial-scale=1"></head>
            <body style="background:#0A0A0F;color:#EDE9FE;font-family:system-ui;padding:2rem">
              <h1>MANISK OS - Personal AI Operating System</h1>
              <p>Frontend not built yet. API is running at /api/health</p>
              <p>Version: ${config.version}</p>
              <a href="/api/health" style="color:#A78BFA">Check API Health</a>
            </body>
          </html>
        `);
      }
    });
  });
  
  app.use(notFoundHandler);
  app.use(errorHandler);
  
  return app;
}
