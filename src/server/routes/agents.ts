import { Router } from 'express';
import { SkillRegistry } from '../core/skillRegistry.js';
import { BackgroundEngine } from '../core/backgroundEngine.js';
import { getDb } from '../db/index.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Agents are represented as skills + background jobs

const AGENT_DEFINITIONS = [
  { id: 'personal_assistant', name: 'Personal Assistant', description: 'Main assistant - handles general queries, context, memory', capabilities: ['chat', 'memory', 'context'], tools: ['memory_save', 'memory_search', 'calendar'], status: 'active' },
  { id: 'researcher', name: 'Research Agent', description: 'Web research, fact checking, reports', capabilities: ['research', 'fact_checking', 'summarization'], tools: ['web_search', 'knowledge_search'], status: 'active' },
  { id: 'task_executor', name: 'Task Executor', description: 'Autonomous task planning and execution', capabilities: ['planning', 'execution', 'verification'], tools: ['task_manager', 'calendar'], status: 'active' },
  { id: 'memory_keeper', name: 'Memory Keeper', description: 'Manages long-term memory and knowledge graph', capabilities: ['memory_management', 'knowledge_graph'], tools: ['memory_save', 'memory_search'], status: 'active' },
  { id: 'computer_agent', name: 'Computer Agent', description: 'File operations, coding, automation', capabilities: ['file_search', 'code', 'automation'], tools: ['file_search', 'code_assistant'], status: 'active' },
  { id: 'creative_agent', name: 'Creative Agent', description: 'Image generation, editing, presentation', capabilities: ['image_generation', 'presentation'], tools: ['image_generation'], status: 'active' }
];

router.get('/', async (req, res) => {
  const userId = (req as any).user.id;
  const skills = SkillRegistry.list(userId);
  
  const agents = AGENT_DEFINITIONS.map(agent => {
    const skill = skills.find(s => s.id.includes(agent.id) || s.name.toLowerCase().includes(agent.id.split('_')[0]));
    return {
      ...agent,
      isEnabled: skill ? skill.isEnabled : true,
      permissions: skill?.permissions || []
    };
  });
  
  res.json({ agents, skills });
});

router.get('/:id', async (req, res) => {
  const agent = AGENT_DEFINITIONS.find(a => a.id === req.params.id);
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }
  res.json({ agent });
});

router.post('/:id/execute', async (req, res) => {
  const userId = (req as any).user.id;
  const agentId = req.params.id;
  const { task, params } = req.body;
  
  const agent = AGENT_DEFINITIONS.find(a => a.id === agentId);
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }
  
  // Create background job for agent execution
  const jobId = BackgroundEngine.createJob({
    type: 'task_execution',
    userId,
    data: { agentId, task, params, requestedAt: new Date().toISOString() }
  }, { priority: 1 });
  
  res.json({ jobId, message: `Agent ${agent.name} started execution`, agentId });
});

router.get('/jobs/list', async (req, res) => {
  const userId = (req as any).user.id;
  const status = req.query.status as string;
  const jobs = BackgroundEngine.listJobs(userId, { status, limit: 20 });
  res.json({ jobs });
});

router.get('/jobs/:id', async (req, res) => {
  const userId = (req as any).user.id;
  const job = BackgroundEngine.getJob(req.params.id, userId);
  
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  
  res.json({ job });
});

router.post('/jobs/:id/cancel', async (req, res) => {
  const userId = (req as any).user.id;
  const success = BackgroundEngine.cancelJob(req.params.id, userId);
  
  if (!success) {
    return res.status(404).json({ error: 'Job not found or not cancellable' });
  }
  
  res.json({ message: 'Job cancelled' });
});

router.post('/emergency-stop', async (req, res) => {
  const userId = (req as any).user.id;
  const { TaskEngine } = await import('../core/taskEngine.js');
  TaskEngine.emergencyStop(userId);
  
  // Cancel all running jobs
  const db = getDb();
  db.prepare("UPDATE background_jobs SET status = 'cancelled', completed_at = datetime('now') WHERE user_id = ? AND status = 'running'").run(userId);
  
  res.json({ message: 'EMERGENCY STOP: All agents and jobs stopped' });
});

export default router;
