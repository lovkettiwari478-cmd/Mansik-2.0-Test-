import { Router } from 'express';
import { z } from 'zod';
import { TaskEngine } from '../core/taskEngine.js';
import { VerificationEngine } from '../core/verification.js';

const router = Router();

router.get('/', async (req, res) => {
  const userId = (req as any).user.id;
  const status = req.query.status as any;
  const priority = req.query.priority as string;
  const limit = parseInt(req.query.limit as string) || 50;
  
  const tasks = TaskEngine.list(userId, { status, priority, limit });
  res.json({ tasks });
});

router.post('/', async (req, res) => {
  const userId = (req as any).user.id;
  const schema = z.object({
    goal: z.string().min(1).max(2000),
    title: z.string().optional(),
    description: z.string().optional(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
    deadline: z.string().optional(),
    dependencies: z.array(z.string()).optional()
  });
  
  try {
    const { goal, title, description, priority, deadline, dependencies } = schema.parse(req.body);
    
    // Validate plan
    const tempPlan = (TaskEngine as any).decomposeGoal(goal);
    const verification = VerificationEngine.verifyPlan(tempPlan);
    
    if (!verification.verified) {
      return res.status(400).json({ error: 'Plan validation failed', verification });
    }
    
    const task = TaskEngine.create(userId, goal, { title, description, priority, deadline, dependencies });
    res.status(201).json({ task, verification });
  } catch (e: any) {
    if (e.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: e.errors });
    }
    res.status(500).json({ error: 'Failed to create task', details: e.message });
  }
});

router.get('/:id', async (req, res) => {
  const userId = (req as any).user.id;
  const task = TaskEngine.get(userId, req.params.id);
  
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }
  
  res.json({ task });
});

router.post('/:id/execute', async (req, res) => {
  const userId = (req as any).user.id;
  const taskId = req.params.id;
  
  const task = TaskEngine.get(userId, taskId);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }
  
  if (TaskEngine.isEmergencyStopped(userId)) {
    return res.status(403).json({ error: 'Emergency stop active - clear it first', code: 'EMERGENCY_STOP' });
  }
  
  // Execute asynchronously but return immediately with status
  res.json({ message: 'Task execution started', taskId, status: 'EXECUTING' });
  
  // Execute in background
  TaskEngine.execute(userId, taskId, async (step) => {
    // Simple tool execution simulation
    console.log(`Executing step ${step.id}: ${step.action}`);
    
    // Simulate work
    await new Promise(r => setTimeout(r, 500));
    
    if (step.tool === 'web_search') {
      return { results: `Search results for ${step.params?.query || 'query'}` };
    }
    if (step.tool === 'memory_search') {
      return { memories: [] };
    }
    
    return { completed: true, step: step.action };
  }).catch(e => {
    console.error(`Task ${taskId} execution failed:`, e);
  });
});

router.post('/:id/cancel', async (req, res) => {
  const userId = (req as any).user.id;
  const task = TaskEngine.cancel(userId, req.params.id);
  
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }
  
  res.json({ task, message: 'Task cancelled' });
});

router.post('/emergency-stop', async (req, res) => {
  const userId = (req as any).user.id;
  TaskEngine.emergencyStop(userId);
  res.json({ message: 'Emergency stop triggered - all executing tasks cancelled' });
});

router.post('/clear-emergency-stop', async (req, res) => {
  const userId = (req as any).user.id;
  TaskEngine.clearEmergencyStop(userId);
  res.json({ message: 'Emergency stop cleared' });
});

router.get('/status/emergency', async (req, res) => {
  const userId = (req as any).user.id;
  const isStopped = TaskEngine.isEmergencyStopped(userId);
  res.json({ emergencyStopped: isStopped });
});

export default router;
