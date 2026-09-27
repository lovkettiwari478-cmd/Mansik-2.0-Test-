import { Router } from 'express';
import { Observability } from '../core/observability.js';
import { ModelRouter } from '../core/modelRouter.js';
import { getDb } from '../db/index.js';
import { AuditLogger } from '../core/auditLogger.js';
import { PredictiveEngine } from '../core/predictiveEngine.js';
import { TaskEngine } from '../core/taskEngine.js';

const router = Router();

router.get('/health', async (req, res) => {
  const health = Observability.getHealth();
  res.json(health);
});

router.get('/status', async (req, res) => {
  const userId = (req as any).user?.id;
  const health = Observability.getHealth();
  const metrics = Observability.getMetrics(userId);
  const predictions = userId ? PredictiveEngine.getPredictions(userId) : [];
  
  res.json({
    health,
    metrics,
    predictions: predictions.slice(0, 5),
    emergencyStopped: userId ? TaskEngine.isEmergencyStopped(userId) : false
  });
});

router.get('/providers', async (req, res) => {
  const providers = ModelRouter.getProviderStatus();
  res.json({ providers });
});

router.get('/audit-logs', async (req, res) => {
  const userId = (req as any).user.id;
  const limit = parseInt(req.query.limit as string) || 50;
  const offset = parseInt(req.query.offset as string) || 0;
  
  const logs = AuditLogger.getLogs(userId, { limit, offset });
  const suspicious = AuditLogger.detectSuspiciousActivity(userId);
  
  res.json({ logs, suspicious });
});

router.get('/metrics', async (req, res) => {
  const userId = (req as any).user.id;
  const metrics = Observability.getMetrics(userId);
  res.json({ metrics });
});

router.get('/predictions', async (req, res) => {
  const userId = (req as any).user.id;
  const predictions = PredictiveEngine.getPredictions(userId);
  res.json({ predictions });
});

router.post('/export-data', async (req, res) => {
  const userId = (req as any).user.id;
  const db = getDb();
  
  const data = {
    user: db.prepare('SELECT id, email, name, created_at FROM users WHERE id = ?').get(userId),
    memories: db.prepare('SELECT * FROM memories WHERE user_id = ?').all(userId),
    tasks: db.prepare('SELECT * FROM tasks WHERE user_id = ?').all(userId),
    conversations: db.prepare('SELECT * FROM conversations WHERE user_id = ?').all(userId),
    calendarEvents: db.prepare('SELECT * FROM calendar_events WHERE user_id = ?').all(userId),
    documents: db.prepare('SELECT * FROM documents WHERE user_id = ?').all(userId),
    exportedAt: new Date().toISOString()
  };
  
  AuditLogger.log({
    userId,
    action: 'export_data',
    resource: 'user_data',
    status: 'success',
    requestId: (req as any).requestId,
    riskLevel: 'medium'
  });
  
  res.json({ data, message: 'Data export completed' });
});

router.delete('/delete-data', async (req, res) => {
  const userId = (req as any).user.id;
  const { confirm } = req.body;
  
  if (confirm !== 'DELETE_ALL_MY_DATA') {
    return res.status(400).json({ error: 'Confirmation required: send { confirm: "DELETE_ALL_MY_DATA" }' });
  }
  
  const db = getDb();
  
  // Delete all user data (but keep user account for audit)
  db.prepare('DELETE FROM memories WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM tasks WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM messages WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM conversations WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM calendar_events WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM documents WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM background_jobs WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM notifications WHERE user_id = ?').run(userId);
  
  AuditLogger.log({
    userId,
    action: 'delete_data',
    resource: 'user_data',
    status: 'success',
    requestId: (req as any).requestId,
    riskLevel: 'critical'
  });
  
  res.json({ message: 'All user data deleted (user account preserved)' });
});

export default router;
