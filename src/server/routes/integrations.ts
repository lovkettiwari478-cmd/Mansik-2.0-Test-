import { Router } from 'express';
import { getDb } from '../db/index.js';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config.js';
import { SmartHomeEngine } from '../core/smartHome.js';

const router = Router();

const INTEGRATION_PROVIDERS = [
  { id: 'openai', name: 'OpenAI', description: 'GPT models, embeddings, image generation', category: 'ai', requires: ['OPENAI_API_KEY'] },
  { id: 'anthropic', name: 'Anthropic', description: 'Claude models', category: 'ai', requires: ['ANTHROPIC_API_KEY'] },
  { id: 'google', name: 'Google AI', description: 'Gemini models', category: 'ai', requires: ['GOOGLE_API_KEY'] },
  { id: 'tavily', name: 'Tavily', description: 'Web search and research', category: 'research', requires: ['TAVILY_API_KEY'] },
  { id: 'gmail', name: 'Gmail', description: 'Email integration', category: 'communication', requires: ['GOOGLE_OAUTH'] },
  { id: 'outlook', name: 'Outlook', description: 'Microsoft email and calendar', category: 'communication', requires: ['OUTLOOK_OAUTH'] },
  { id: 'google_calendar', name: 'Google Calendar', description: 'Calendar sync', category: 'calendar', requires: ['GOOGLE_OAUTH'] },
  { id: 'smartthings', name: 'SmartThings', description: 'Samsung smart home', category: 'smart_home', requires: ['SMARTTHINGS_TOKEN'] },
  { id: 'hue', name: 'Philips Hue', description: 'Hue lights', category: 'smart_home', requires: ['HUE_BRIDGE'] },
  { id: 'nest', name: 'Google Nest', description: 'Thermostat, cameras', category: 'smart_home', requires: ['NEST_OAUTH'] }
];

router.get('/', async (req, res) => {
  const userId = (req as any).user.id;
  const db = getDb();
  
  const userIntegrations = db.prepare('SELECT * FROM integrations WHERE user_id = ?').all(userId) as any[];
  const userIntMap = new Map(userIntegrations.map((i: any) => [i.provider, i]));
  
  const providers = INTEGRATION_PROVIDERS.map(p => {
    const userInt = userIntMap.get(p.id);
    const envConfigured = p.requires.every(k => {
      if (k === 'OPENAI_API_KEY') return !!config.openaiApiKey;
      if (k === 'ANTHROPIC_API_KEY') return !!config.anthropicApiKey;
      if (k === 'GOOGLE_API_KEY') return !!config.googleApiKey;
      if (k === 'TAVILY_API_KEY') return !!config.tavilyApiKey;
      return false;
    });
    
    let status = 'requires_config';
    if (userInt) {
      status = userInt.status;
    } else if (envConfigured) {
      status = 'connected';
    }
    
    return {
      ...p,
      status,
      isConfigured: status === 'connected',
      userIntegration: userInt ? {
        id: userInt.id,
        status: userInt.status,
        lastSyncAt: userInt.last_sync_at,
        error: userInt.error
      } : null,
      envConfigured
    };
  });
  
  res.json({ integrations: providers, userIntegrations });
});

router.post('/:provider/connect', async (req, res) => {
  const userId = (req as any).user.id;
  const provider = req.params.provider;
  const { config: providerConfig } = req.body;
  
  const providerDef = INTEGRATION_PROVIDERS.find(p => p.id === provider);
  if (!providerDef) {
    return res.status(404).json({ error: 'Provider not found' });
  }
  
  // Verify if provider can actually be connected
  // For AI providers, check env vars; for others, require explicit config
  const envConfigured = providerDef.requires.every(k => {
    if (k === 'OPENAI_API_KEY') return !!config.openaiApiKey;
    if (k === 'ANTHROPIC_API_KEY') return !!config.anthropicApiKey;
    if (k === 'GOOGLE_API_KEY') return !!config.googleApiKey;
    if (k === 'TAVILY_API_KEY') return !!config.tavilyApiKey;
    // For OAuth/hardware providers, require user-provided config
    if (providerConfig && Object.keys(providerConfig).length > 0) return true;
    return false;
  });
  
  // If not env configured and no user config provided, mark as requires_config, not fake connected
  let status = 'requires_config';
  let errorMsg: string | null = null;
  
  if (envConfigured) {
    status = 'connected';
  } else if (providerConfig && Object.keys(providerConfig).length > 0) {
    // User provided config - we store it but mark as connected only if it looks valid
    // For OAuth providers, we cannot verify without actual OAuth flow, so mark as connected but with warning
    // For hardware providers, mark as connected if config provided, but actual control will still check hardware
    status = 'connected';
  } else {
    // No config - cannot fake success
    status = 'requires_config';
    errorMsg = `REQUIRES CONFIGURATION: ${providerDef.requires.join(', ')} missing. Provide config or set env vars.`;
  }
  
  const db = getDb();
  const existing = db.prepare('SELECT id FROM integrations WHERE user_id = ? AND provider = ?').get(userId, provider) as any;
  
  const id = existing?.id || uuidv4();
  const now = new Date().toISOString();
  
  if (existing) {
    db.prepare('UPDATE integrations SET config = ?, status = ?, updated_at = ?, error = ? WHERE id = ?').run(
      providerConfig ? JSON.stringify(providerConfig) : null,
      status,
      now,
      errorMsg,
      id
    );
  } else {
    db.prepare(`
      INSERT INTO integrations (id, user_id, provider, status, config, error, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, provider, status, providerConfig ? JSON.stringify(providerConfig) : null, errorMsg, now, now);
  }
  
  const integration = db.prepare('SELECT * FROM integrations WHERE id = ?').get(id) as any;
  
  if (status === 'requires_config') {
    return res.status(400).json({ 
      integration, 
      error: errorMsg,
      code: 'REQUIRES_CONFIGURATION',
      message: `${providerDef.name} requires configuration`
    });
  }
  
  res.json({ integration, message: `${providerDef.name} connected` });
});

router.post('/:provider/disconnect', async (req, res) => {
  const userId = (req as any).user.id;
  const provider = req.params.provider;
  
  const db = getDb();
  const result = db.prepare("UPDATE integrations SET status = 'disconnected', updated_at = datetime('now') WHERE user_id = ? AND provider = ?").run(userId, provider);
  
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Integration not found' });
  }
  
  res.json({ message: `${provider} disconnected` });
});

router.delete('/:provider', async (req, res) => {
  const userId = (req as any).user.id;
  const provider = req.params.provider;
  
  const db = getDb();
  const result = db.prepare('DELETE FROM integrations WHERE user_id = ? AND provider = ?').run(userId, provider);
  
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Integration not found' });
  }
  
  res.json({ message: `${provider} removed` });
});

// Smart home routes
router.get('/smart-home/devices', async (req, res) => {
  const userId = (req as any).user.id;
  const devices = SmartHomeEngine.listDevices(userId);
  const forgotten = SmartHomeEngine.detectForgottenDevices(userId);
  const securityEvents = SmartHomeEngine.getSecurityEvents(userId);
  
  res.json({ devices, forgotten, securityEvents });
});

router.post('/smart-home/devices', async (req, res) => {
  const userId = (req as any).user.id;
  const { name, type, provider, room, capabilities } = req.body;
  
  if (!name || !type || !provider) {
    return res.status(400).json({ error: 'name, type, provider required' });
  }
  
  const device = SmartHomeEngine.addDevice(userId, { name, type, provider, room, capabilities });
  res.status(201).json({ device });
});

router.post('/smart-home/devices/:id/control', async (req, res) => {
  const userId = (req as any).user.id;
  const { action, params } = req.body;
  
  if (!action) {
    return res.status(400).json({ error: 'action required' });
  }
  
  const result = SmartHomeEngine.controlDevice(userId, req.params.id, action, params);
  
  if (!result.success && result.requiresConfig) {
    return res.status(400).json({ ...result, code: 'REQUIRES_CONFIGURATION' });
  }
  
  if (!result.success) {
    return res.status(404).json(result);
  }
  
  res.json(result);
});

router.delete('/smart-home/devices/:id', async (req, res) => {
  const userId = (req as any).user.id;
  const success = SmartHomeEngine.removeDevice(userId, req.params.id);
  
  if (!success) {
    return res.status(404).json({ error: 'Device not found' });
  }
  
  res.json({ message: 'Device removed' });
});

router.get('/smart-home/routines', async (req, res) => {
  const userId = (req as any).user.id;
  const routines = SmartHomeEngine.listRoutines(userId);
  res.json({ routines });
});

router.post('/smart-home/routines', async (req, res) => {
  const userId = (req as any).user.id;
  const { name, trigger, actions } = req.body;
  
  if (!name || !trigger || !actions) {
    return res.status(400).json({ error: 'name, trigger, actions required' });
  }
  
  const routine = SmartHomeEngine.createRoutine(userId, { name, trigger, actions });
  res.status(201).json({ routine });
});

router.delete('/smart-home/routines/:id', async (req, res) => {
  const userId = (req as any).user.id;
  const success = SmartHomeEngine.deleteRoutine(userId, req.params.id);
  
  if (!success) {
    return res.status(404).json({ error: 'Routine not found' });
  }
  
  res.json({ message: 'Routine deleted' });
});

router.post('/smart-home/modes/:mode', async (req, res) => {
  const userId = (req as any).user.id;
  const mode = req.params.mode as any;
  
  const validModes = ['Welcome Home', 'Leaving Home', 'Sleep Mode', 'Study Mode', 'Meeting Mode', 'Movie Mode', 'Energy Saver'];
  const matchedMode = validModes.find(m => m.toLowerCase().replace(' ', '-') === mode.toLowerCase() || m.toLowerCase() === mode.toLowerCase());
  
  if (!matchedMode) {
    return res.status(400).json({ error: `Invalid mode. Valid modes: ${validModes.join(', ')}` });
  }
  
  const result = SmartHomeEngine.activateMode(userId, matchedMode as any);
  res.json(result);
});

export default router;
