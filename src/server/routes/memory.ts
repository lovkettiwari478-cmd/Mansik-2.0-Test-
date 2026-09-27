import { Router } from 'express';
import { z } from 'zod';
import { MemoryEngine } from '../core/memoryEngine.js';

const router = Router();

router.get('/', async (req, res) => {
  const userId = (req as any).user.id;
  const type = req.query.type as string | undefined;
  const limit = parseInt(req.query.limit as string) || 50;
  const offset = parseInt(req.query.offset as string) || 0;
  
  const memories = MemoryEngine.list(userId, { type, limit, offset });
  res.json({ memories, total: memories.length });
});

router.get('/search', async (req, res) => {
  const userId = (req as any).user.id;
  const query = req.query.q as string;
  
  if (!query) {
    return res.status(400).json({ error: 'Query parameter q required' });
  }
  
  const results = await MemoryEngine.search(userId, query, { limit: 20, approvedOnly: false });
  res.json({ results, query });
});

router.post('/', async (req, res) => {
  const userId = (req as any).user.id;
  const schema = z.object({
    content: z.string().min(1).max(5000),
    type: z.enum(['short_term', 'long_term', 'approved', 'preference', 'fact', 'routine']).optional(),
    tags: z.array(z.string()).optional()
  });
  
  try {
    const { content, type, tags } = schema.parse(req.body);
    
    const result = await MemoryEngine.save(userId, content, {
      type: type || 'approved',
      source: 'user_input',
      provenance: 'Manual save via API',
      tags,
      isApproved: true
    });
    
    if (result.isDuplicate) {
      return res.status(409).json({ error: 'Duplicate memory', existingId: result.id });
    }
    
    const memory = MemoryEngine.getById(userId, result.id);
    res.status(201).json({ memory });
  } catch (e: any) {
    if (e.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: e.errors });
    }
    res.status(500).json({ error: 'Failed to save memory' });
  }
});

router.get('/:id', async (req, res) => {
  const userId = (req as any).user.id;
  const memory = MemoryEngine.getById(userId, req.params.id);
  
  if (!memory) {
    return res.status(404).json({ error: 'Memory not found' });
  }
  
  res.json({ memory });
});

router.put('/:id', async (req, res) => {
  const userId = (req as any).user.id;
  const schema = z.object({
    content: z.string().min(1).max(5000)
  });
  
  try {
    const { content } = schema.parse(req.body);
    const success = await MemoryEngine.update(userId, req.params.id, content, 'Corrected via API');
    
    if (!success) {
      return res.status(404).json({ error: 'Memory not found' });
    }
    
    const memory = MemoryEngine.getById(userId, req.params.id);
    res.json({ memory });
  } catch (e: any) {
    if (e.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: e.errors });
    }
    res.status(500).json({ error: 'Failed to update memory' });
  }
});

router.delete('/:id', async (req, res) => {
  const userId = (req as any).user.id;
  const success = MemoryEngine.delete(userId, req.params.id);
  
  if (!success) {
    return res.status(404).json({ error: 'Memory not found' });
  }
  
  res.json({ message: 'Memory deleted' });
});

router.post('/forget', async (req, res) => {
  const userId = (req as any).user.id;
  const schema = z.object({
    query: z.string().min(1)
  });
  
  try {
    const { query } = schema.parse(req.body);
    const result = MemoryEngine.forget(userId, query);
    res.json({ message: `Forgot ${result.deletedCount} memories`, ...result });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/:id/approve', async (req, res) => {
  const userId = (req as any).user.id;
  const success = MemoryEngine.approve(userId, req.params.id);
  
  if (!success) {
    return res.status(404).json({ error: 'Memory not found' });
  }
  
  res.json({ message: 'Memory approved' });
});

export default router;
