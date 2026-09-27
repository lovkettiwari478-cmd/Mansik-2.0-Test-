import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/index.js';
import { Orchestrator } from '../core/orchestrator.js';
import { PersonalityEngine } from '../core/personalityEngine.js';

const router = Router();

const chatSchema = z.object({
  message: z.string().min(1).max(10000),
  conversationId: z.string().optional()
});

router.post('/', async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { message, conversationId } = chatSchema.parse(req.body);
    const requestId = (req as any).requestId;
    
    const db = getDb();
    
    // Get or create conversation
    let convId = conversationId;
    if (!convId) {
      convId = uuidv4();
      const now = new Date().toISOString();
      const title = message.slice(0, 50) + (message.length > 50 ? '...' : '');
      db.prepare('INSERT INTO conversations (id, user_id, title, created_at, updated_at, message_count) VALUES (?, ?, ?, ?, ?, 0)').run(convId, userId, title, now, now);
    } else {
      const conv = db.prepare('SELECT id FROM conversations WHERE id = ? AND user_id = ?').get(convId, userId) as any;
      if (!conv) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
    }
    
    // Save user message
    const userMsgId = uuidv4();
    const now = new Date().toISOString();
    db.prepare('INSERT INTO messages (id, conversation_id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(userMsgId, convId, userId, 'user', message, now);
    db.prepare('UPDATE conversations SET updated_at = ?, message_count = message_count + 1 WHERE id = ?').run(now, convId);
    
    // Process through orchestrator
    const result = await Orchestrator.process({
      userId,
      conversationId: convId,
      input: message,
      requestId
    });
    
    // Get user preferences for personality adaptation
    const user = db.prepare('SELECT preferences, name FROM users WHERE id = ?').get(userId) as any;
    const prefs = user?.preferences ? JSON.parse(user.preferences) : {};
    
    const profile = {
      tone: prefs.tone || 'friendly',
      responseLength: prefs.responseLength || 'adaptive',
      focusMode: !!prefs.focusMode,
      quietMode: !!prefs.quietMode,
      urgentMode: !!prefs.urgentMode || PersonalityEngine.detectUrgency(message)
    };
    
    const adaptedMessage = PersonalityEngine.adaptResponse(result.message, profile, {
      isUrgent: profile.urgentMode,
      isComplex: result.intent.confidence < 0.6
    });
    
    // Save assistant message
    const assistantMsgId = uuidv4();
    db.prepare(`
      INSERT INTO messages (id, conversation_id, user_id, role, content, intent, tool_calls, memories_used, tasks_created, model_used, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      assistantMsgId,
      convId,
      userId,
      'assistant',
      adaptedMessage,
      JSON.stringify(result.intent),
      JSON.stringify(result.toolCalls),
      JSON.stringify(result.memoriesUsed),
      JSON.stringify(result.tasksCreated),
      result.modelProvider,
      new Date().toISOString()
    );
    
    db.prepare('UPDATE conversations SET updated_at = ?, message_count = message_count + 1 WHERE id = ?').run(new Date().toISOString(), convId);
    
    res.json({
      conversationId: convId,
      message: {
        id: assistantMsgId,
        role: 'assistant',
        content: adaptedMessage,
        intent: result.intent,
        toolCalls: result.toolCalls,
        memoriesUsed: result.memoriesUsed,
        tasksCreated: result.tasksCreated,
        modelProvider: result.modelProvider,
        requiresPermission: result.requiresPermission,
        timestamp: new Date().toISOString()
      },
      contextUsed: result.contextUsed
    });
    
  } catch (error: any) {
    console.error('Chat error:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid request' });
    }
    // Never expose internal error details to user
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.get('/conversations', async (req, res) => {
  const userId = (req as any).user.id;
  const db = getDb();
  const conversations = db.prepare('SELECT * FROM conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50').all(userId) as any[];
  res.json({ conversations });
});

router.get('/conversations/:id/messages', async (req, res) => {
  const userId = (req as any).user.id;
  const convId = req.params.id;
  
  const db = getDb();
  const conv = db.prepare('SELECT id FROM conversations WHERE id = ? AND user_id = ?').get(convId, userId) as any;
  if (!conv) {
    return res.status(404).json({ error: 'Conversation not found' });
  }
  
  const messages = db.prepare('SELECT * FROM messages WHERE conversation_id = ? AND user_id = ? ORDER BY created_at ASC LIMIT 100').all(convId, userId) as any[];
  
  res.json({ messages: messages.map((m: any) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    intent: m.intent ? JSON.parse(m.intent) : undefined,
    toolCalls: m.tool_calls ? JSON.parse(m.tool_calls) : undefined,
    memoriesUsed: m.memories_used ? JSON.parse(m.memories_used) : undefined,
    tasksCreated: m.tasks_created ? JSON.parse(m.tasks_created) : undefined,
    modelUsed: m.model_used,
    timestamp: m.created_at
  })) });
});

router.delete('/conversations/:id', async (req, res) => {
  const userId = (req as any).user.id;
  const convId = req.params.id;
  
  const db = getDb();
  const result = db.prepare('DELETE FROM conversations WHERE id = ? AND user_id = ?').run(convId, userId);
  
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Conversation not found' });
  }
  
  res.json({ message: 'Conversation deleted' });
});

export default router;
