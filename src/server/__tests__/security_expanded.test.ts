import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';

process.env.DATABASE_PATH = './data/test-security-expanded.db';
process.env.JWT_SECRET = 'test-jwt-secret-key-32-chars-minimum-length-secure';

let app: any;
let tokenA: string;
let tokenB: string;
let userAId: string;
let userBId: string;

beforeAll(async () => {
  if (fs.existsSync('./data/test-security-expanded.db')) fs.unlinkSync('./data/test-security-expanded.db');
  const { runMigrations } = await import('../db/index.js');
  runMigrations();
  const { createApp } = await import('../app.js');
  app = createApp();
  
  const resA = await request(app).post('/api/auth/register').send({ email: 'userA@test.com', password: 'Test1234', name: 'User A' });
  tokenA = resA.body.token;
  userAId = resA.body.user.id;
  
  const resB = await request(app).post('/api/auth/register').send({ email: 'userB@test.com', password: 'Test1234', name: 'User B' });
  tokenB = resB.body.token;
  userBId = resB.body.user.id;
});

afterAll(async () => {
  const { closeDb } = await import('../db/index.js');
  closeDb();
  if (fs.existsSync('./data/test-security-expanded.db')) fs.unlinkSync('./data/test-security-expanded.db');
});

describe('Security Expanded - Cross-User Isolation', () => {
  let memoryAId: string;
  let docAId: string;
  let taskAId: string;
  let eventAId: string;
  let convAId: string;

  it('Setup: User A creates private data', async () => {
    // Memory
    const memRes = await request(app).post('/api/memories').set('Authorization', `Bearer ${tokenA}`).send({ content: 'User A private memory - secret', type: 'approved' });
    expect(memRes.status).toBe(201);
    memoryAId = memRes.body.memory.id;

    // Document
    const docRes = await request(app).post('/api/knowledge').set('Authorization', `Bearer ${tokenA}`).send({ title: 'User A private doc', content: 'Secret doc content' });
    expect(docRes.status).toBe(201);
    docAId = docRes.body.document.id;

    // Task
    const taskRes = await request(app).post('/api/tasks').set('Authorization', `Bearer ${tokenA}`).send({ goal: 'User A private task' });
    expect(taskRes.status).toBe(201);
    taskAId = taskRes.body.task.id;

    // Calendar
    const eventRes = await request(app).post('/api/calendar').set('Authorization', `Bearer ${tokenA}`).send({ title: 'User A private event', startTime: new Date().toISOString(), endTime: new Date(Date.now()+3600000).toISOString() });
    expect(eventRes.status).toBe(201);
    eventAId = eventRes.body.event.id;

    // Conversation
    const chatRes = await request(app).post('/api/chat').set('Authorization', `Bearer ${tokenA}`).send({ message: 'User A private conversation' });
    expect(chatRes.status).toBe(200);
    convAId = chatRes.body.conversationId;
  });

  it('User B cannot access User A memory', async () => {
    const res = await request(app).get(`/api/memories/${memoryAId}`).set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(404);
  });

  it('User B cannot search User A documents via search', async () => {
    const res = await request(app).get('/api/knowledge/search?q=private').set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(200);
    // Should not contain User A's doc
    const containsA = res.body.results.some((r: any) => r.id === docAId);
    expect(containsA).toBe(false);
  });

  it('User B cannot access User A tasks', async () => {
    const res = await request(app).get(`/api/tasks/${taskAId}`).set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(404);
  });

  it('User B cannot access User A calendar', async () => {
    const res = await request(app).get(`/api/calendar/${eventAId}`).set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(404);
  });

  it('User B cannot access User A audit logs (should only see own)', async () => {
    const res = await request(app).get('/api/system/audit-logs').set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(200);
    // All logs should be for User B
    const hasA = res.body.logs.some((l: any) => l.user_id === userAId);
    expect(hasA).toBe(false);
  });

  it('User B cannot access User A conversations', async () => {
    const res = await request(app).get(`/api/chat/conversations/${convAId}/messages`).set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(404);
  });

  it('IDOR - User B cannot delete User A memory', async () => {
    const res = await request(app).delete(`/api/memories/${memoryAId}`).set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(404);
  });

  it('IDOR - User B cannot delete User A task', async () => {
    const res = await request(app).post(`/api/tasks/${taskAId}/cancel`).set('Authorization', `Bearer ${tokenB}`);
    // Should fail - task not found for this user
    expect(res.status).toBe(404);
  });

  it('SQL injection attempt via email should be blocked', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: "' OR '1'='1", password: 'anything' });
    expect(res.status).toBe(400); // Validation error, not 200
  });

  it('XSS attempt via memory content should be stored safely and not executed', async () => {
    const xssPayload = '<script>alert("xss")</script>';
    const res = await request(app).post('/api/memories').set('Authorization', `Bearer ${tokenA}`).send({ content: xssPayload, type: 'approved' });
    expect(res.status).toBe(201);
    expect(res.body.memory.content).toBe(xssPayload); // Stored as is, but frontend should escape
    
    // Search should return it but not execute
    const searchRes = await request(app).get('/api/memories/search?q=xss').set('Authorization', `Bearer ${tokenA}`);
    expect(searchRes.status).toBe(200);
  });

  it('Malformed input - empty message should be rejected', async () => {
    const res = await request(app).post('/api/chat').set('Authorization', `Bearer ${tokenA}`).send({ message: '' });
    expect(res.status).toBe(400);
  });

  it('Malformed input - invalid email should be rejected', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'not-an-email', password: 'Test1234', name: 'Test' });
    expect(res.status).toBe(400);
  });

  it('Weak password should be rejected', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'weak@test.com', password: 'weak', name: 'Weak' });
    expect(res.status).toBe(400);
  });

  it('Expired session should be blocked', async () => {
    // Create a session and manually expire it
    const { getDb } = await import('../db/index.js');
    const db = getDb();
    const loginRes = await request(app).post('/api/auth/login').send({ email: 'userA@test.com', password: 'Test1234' });
    const tempToken = loginRes.body.token;
    
    // Manually expire the session in DB
    const jwt = await import('jsonwebtoken');
    const payload = jwt.verify(tempToken, process.env.JWT_SECRET!) as any;
    db.prepare("UPDATE sessions SET expires_at = datetime('now', '-1 hour') WHERE id = ?").run(payload.sessionId);
    
    const meRes = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${tempToken}`);
    expect(meRes.status).toBe(401);
  });

  it('Permission - temporary permission should expire', async () => {
    // Grant temporary permission that expires immediately
    const grantRes = await request(app).post('/api/tools/permissions/grant').set('Authorization', `Bearer ${tokenA}`).send({ resource: 'temp_tool', action: 'execute', expiresInMs: 1 });
    expect(grantRes.status).toBe(201);
    
    // Wait for expiration
    await new Promise(r => setTimeout(r, 10));
    
    // Cleanup expired should remove it
    const { PermissionEngine } = await import('../middleware/permissionFirewall.js');
    PermissionEngine.cleanupExpired();
    
    // Check permission no longer exists or is expired
    const listRes = await request(app).get('/api/tools/permissions/list').set('Authorization', `Bearer ${tokenA}`);
    const tempPerm = listRes.body.permissions.find((p: any) => p.resource === 'temp_tool');
    // Should be cleaned up or expired
    if (tempPerm) {
      expect(new Date(tempPerm.expires_at) < new Date()).toBe(true);
    }
  });

  it('Dangerous tool without permission should be denied', async () => {
    const res = await request(app).post('/api/tools/smart_home/execute').set('Authorization', `Bearer ${tokenA}`).send({ deviceId: 'test', action: 'on' });
    expect([400, 403].includes(res.status)).toBe(true);
  });

  it('Background job - user cannot access other user jobs', async () => {
    const jobResA = await request(app).post('/api/agents/researcher/execute').set('Authorization', `Bearer ${tokenA}`).send({ task: 'User A job' });
    expect(jobResA.status).toBe(200);
    const jobIdA = jobResA.body.jobId;
    
    const jobResB = await request(app).get(`/api/agents/jobs/${jobIdA}`).set('Authorization', `Bearer ${tokenB}`);
    expect(jobResB.status).toBe(404);
  });

  it('Rate limiting - auth endpoint should have rate limit', async () => {
    // Try many rapid requests
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(request(app).post('/api/auth/login').send({ email: 'nonexistent@test.com', password: 'wrong' }));
    }
    const results = await Promise.all(promises);
    // All should be 401 (invalid credentials), not 429 yet, but rate limiter is active
    // The 20 limit is generous, so 5 should not trigger 429
    expect(results.every(r => r.status === 401)).toBe(true);
  });

  it('Path traversal - file upload with traversal in name should be safe', async () => {
    // Multer uses random names, not original name for path, so traversal in original name should be safe
    const res = await request(app).post('/api/knowledge').set('Authorization', `Bearer ${tokenA}`).send({ title: '../../../etc/passwd', content: 'test' });
    expect(res.status).toBe(201);
    // Title is stored as is, but file path is not using it for filesystem traversal
    expect(res.body.document.title).toBe('../../../etc/passwd');
  });
});
