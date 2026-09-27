import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

router.get('/', async (req, res) => {
  const userId = (req as any).user.id;
  const db = getDb();
  
  const from = req.query.from as string;
  const to = req.query.to as string;
  
  let sql = 'SELECT * FROM calendar_events WHERE user_id = ?';
  const params: any[] = [userId];
  
  if (from) {
    sql += ' AND start_time >= ?';
    params.push(from);
  }
  if (to) {
    sql += ' AND end_time <= ?';
    params.push(to);
  }
  
  sql += ' ORDER BY start_time ASC LIMIT 100';
  
  const events = db.prepare(sql).all(...params) as any[];
  res.json({ events });
});

router.post('/', async (req, res) => {
  const userId = (req as any).user.id;
  const schema = z.object({
    title: z.string().min(1).max(200),
    description: z.string().optional(),
    startTime: z.string(),
    endTime: z.string(),
    location: z.string().optional(),
    attendees: z.array(z.string()).optional()
  });
  
  try {
    const { title, description, startTime, endTime, location, attendees } = schema.parse(req.body);
    
    const start = new Date(startTime);
    const end = new Date(endTime);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }
    
    if (end <= start) {
      return res.status(400).json({ error: 'End time must be after start time' });
    }
    
    // Conflict detection
    const db = getDb();
    const conflicts = db.prepare(`
      SELECT id, title, start_time, end_time FROM calendar_events 
      WHERE user_id = ? AND (
        (start_time <= ? AND end_time > ?) OR
        (start_time < ? AND end_time >= ?) OR
        (start_time >= ? AND end_time <= ?)
      )
    `).all(userId, startTime, startTime, endTime, endTime, startTime, endTime) as any[];
    
    const id = uuidv4();
    const now = new Date().toISOString();
    
    db.prepare(`
      INSERT INTO calendar_events (id, user_id, title, description, start_time, end_time, location, attendees, status, source, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', 'local', ?, ?)
    `).run(
      id,
      userId,
      title,
      description || null,
      start.toISOString(),
      end.toISOString(),
      location || null,
      attendees ? JSON.stringify(attendees) : null,
      now,
      now
    );
    
    const event = db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(id);
    
    res.status(201).json({ 
      event,
      conflicts: conflicts.length > 0 ? conflicts : undefined,
      warning: conflicts.length > 0 ? `Schedule conflict detected with ${conflicts.length} events` : undefined
    });
  } catch (e: any) {
    if (e.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: e.errors });
    }
    res.status(500).json({ error: 'Failed to create event' });
  }
});

router.get('/:id', async (req, res) => {
  const userId = (req as any).user.id;
  const db = getDb();
  const event = db.prepare('SELECT * FROM calendar_events WHERE id = ? AND user_id = ?').get(req.params.id, userId) as any;
  
  if (!event) {
    return res.status(404).json({ error: 'Event not found' });
  }
  
  res.json({ event });
});

router.put('/:id', async (req, res) => {
  const userId = (req as any).user.id;
  const db = getDb();
  
  const existing = db.prepare('SELECT id FROM calendar_events WHERE id = ? AND user_id = ?').get(req.params.id, userId) as any;
  if (!existing) {
    return res.status(404).json({ error: 'Event not found' });
  }
  
  const { title, description, startTime, endTime, location } = req.body;
  
  const fields: string[] = [];
  const values: any[] = [];
  
  if (title) { fields.push('title = ?'); values.push(title); }
  if (description !== undefined) { fields.push('description = ?'); values.push(description); }
  if (startTime) { fields.push('start_time = ?'); values.push(new Date(startTime).toISOString()); }
  if (endTime) { fields.push('end_time = ?'); values.push(new Date(endTime).toISOString()); }
  if (location !== undefined) { fields.push('location = ?'); values.push(location); }
  
  if (fields.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }
  
  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(req.params.id, userId);
  
  db.prepare(`UPDATE calendar_events SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`).run(...values);
  
  const updated = db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(req.params.id) as any;
  res.json({ event: updated });
});

router.delete('/:id', async (req, res) => {
  const userId = (req as any).user.id;
  const db = getDb();
  const result = db.prepare('DELETE FROM calendar_events WHERE id = ? AND user_id = ?').run(req.params.id, userId);
  
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Event not found' });
  }
  
  res.json({ message: 'Event deleted' });
});

router.get('/briefing/daily', async (req, res) => {
  const userId = (req as any).user.id;
  const db = getDb();
  
  const today = new Date().toISOString().split('T')[0];
  const events = db.prepare(`
    SELECT * FROM calendar_events 
    WHERE user_id = ? AND date(start_time) = date('now')
    ORDER BY start_time ASC
  `).all(userId) as any[];
  
  const tasks = db.prepare(`
    SELECT * FROM tasks 
    WHERE user_id = ? AND status IN ('PLANNED', 'APPROVED', 'EXECUTING') 
    ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END
    LIMIT 10
  `).all(userId) as any[];
  
  const overdueTasks = db.prepare(`
    SELECT * FROM tasks 
    WHERE user_id = ? AND deadline < datetime('now') AND status != 'COMPLETED'
  `).all(userId) as any[];
  
  res.json({
    date: today,
    events,
    tasks,
    overdueTasks,
    summary: `You have ${events.length} events today and ${tasks.length} pending tasks${overdueTasks.length > 0 ? `, ${overdueTasks.length} overdue` : ''}`
  });
});

export default router;
