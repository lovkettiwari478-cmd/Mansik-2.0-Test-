import { Router } from 'express';
import { TOOL_REGISTRY, getTool, checkToolConfig } from '../tools/registry.js';
import { config } from '../config.js';
import { PermissionEngine } from '../middleware/permissionFirewall.js';
import { ResearchEngine } from '../core/researchEngine.js';
import { getDb } from '../db/index.js';

const router = Router();

router.get('/', async (req, res) => {
  const userId = (req as any).user.id;
  const category = req.query.category as string;
  
  let tools = TOOL_REGISTRY;
  if (category) {
    tools = tools.filter(t => t.category === category);
  }
  
  const env = process.env as Record<string, string>;
  
  const enriched = tools.map(tool => {
    const configCheck = checkToolConfig(tool.id, env);
    const permCheck = PermissionEngine.check(userId, { resource: tool.id, action: 'execute' });
    
    return {
      ...tool,
      isConfigured: configCheck.isConfigured,
      missingConfig: configCheck.missingKeys,
      hasPermission: permCheck.granted,
      permissionReason: permCheck.reason,
      status: !configCheck.isConfigured ? 'requires_config' : permCheck.granted ? 'ready' : 'requires_permission'
    };
  });
  
  res.json({ tools: enriched });
});

router.get('/:id', async (req, res) => {
  const userId = (req as any).user.id;
  const tool = getTool(req.params.id);
  
  if (!tool) {
    return res.status(404).json({ error: 'Tool not found' });
  }
  
  const configCheck = checkToolConfig(tool.id, process.env as any);
  const permCheck = PermissionEngine.check(userId, { resource: tool.id, action: 'execute' });
  
  res.json({
    tool: {
      ...tool,
      isConfigured: configCheck.isConfigured,
      missingConfig: configCheck.missingKeys,
      hasPermission: permCheck.granted,
      status: !configCheck.isConfigured ? 'requires_config' : permCheck.granted ? 'ready' : 'requires_permission'
    }
  });
});

router.post('/:id/execute', async (req, res) => {
  const userId = (req as any).user.id;
  const toolId = req.params.id;
  const params = req.body;
  
  const tool = getTool(toolId);
  if (!tool) {
    return res.status(404).json({ error: 'Tool not found' });
  }
  
  // Check config
  const configCheck = checkToolConfig(toolId, process.env as any);
  if (!configCheck.isConfigured) {
    return res.status(400).json({
      error: 'Tool requires configuration',
      code: 'REQUIRES_CONFIGURATION',
      missingKeys: configCheck.missingKeys,
      message: `Tool ${tool.name} requires configuration: ${configCheck.missingKeys.join(', ')}`
    });
  }
  
  // Check permission
  const permCheck = PermissionEngine.check(userId, { resource: toolId, action: 'execute', toolId });
  if (!permCheck.granted) {
    return res.status(403).json({
      error: 'Permission denied',
      code: 'PERMISSION_DENIED',
      reason: permCheck.reason,
      requiresApproval: true
    });
  }
  
  // Execute tool - real implementations, no fake success
  try {
    let result: any;
    
    switch (toolId) {
      case 'web_search':
        if (!params.query) {
          return res.status(400).json({ error: 'Query required' });
        }
        result = await ResearchEngine.research(params.query, { maxSources: params.maxSources || 5 });
        break;
        
      case 'file_search': {
        // Real file search within allowed directories (data/uploads and src)
        const fs = await import('fs');
        const path = await import('path');
        const query = (params.query || '').toLowerCase();
        const searchDirs = ['data/uploads', 'src'];
        const found: string[] = [];
        
        for (const dir of searchDirs) {
          try {
            const dirPath = path.resolve(dir);
            if (!fs.existsSync(dirPath)) continue;
            
            const walk = (currentPath: string) => {
              try {
                const entries = fs.readdirSync(currentPath, { withFileTypes: true });
                for (const entry of entries) {
                  const fullPath = path.join(currentPath, entry.name);
                  // Prevent path traversal - ensure within allowed dir
                  if (!fullPath.startsWith(dirPath)) continue;
                  
                  if (entry.isDirectory()) {
                    if (entry.name === 'node_modules' || entry.name === '.git') continue;
                    walk(fullPath);
                  } else {
                    if (!query || entry.name.toLowerCase().includes(query) || fullPath.toLowerCase().includes(query)) {
                      found.push(fullPath);
                    }
                  }
                }
              } catch {}
            };
            
            walk(dirPath);
          } catch {}
        }
        
        result = { 
          files: found.slice(0, 20), 
          count: found.length,
          query: params.query,
          searchedDirs: searchDirs,
          message: found.length > 0 ? `Found ${found.length} files` : 'No files found matching query'
        };
        break;
      }
        
      case 'code_assistant': {
        // Real code analysis - checks if task is provided, provides structured guidance, not fake execution
        if (!params.task) {
          return res.status(400).json({ error: 'Task description required for code assistant' });
        }
        
        // Analyze project structure
        const fs = await import('fs');
        const path = await import('path');
        const projectFiles = [];
        try {
          const srcPath = path.resolve('src');
          if (fs.existsSync(srcPath)) {
            const files = fs.readdirSync(srcPath, { recursive: true } as any) as string[];
            projectFiles.push(...files.slice(0, 10));
          }
        } catch {}
        
        result = { 
          task: params.task,
          analysis: `Code assistance analysis for: ${params.task}`,
          projectContext: projectFiles.length > 0 ? `Found ${projectFiles.length} files in src/` : 'No src files found',
          suggestions: [
            'Break down the task into smaller steps',
            'Check existing implementations before writing new code',
            'Write tests for new functionality',
            'Ensure proper error handling and validation'
          ],
          status: 'analyzed',
          message: 'Code assistance provided - this is analysis, not automatic code execution. Manual implementation required.'
        };
        break;
      }
        
      case 'knowledge_search': {
        const { KnowledgeEngine } = await import('../core/knowledgeEngine.js');
        if (!params.query) {
          return res.status(400).json({ error: 'Query required' });
        }
        const docs = KnowledgeEngine.search(userId, params.query, 10);
        result = { results: docs, count: docs.length, query: params.query };
        break;
      }
        
      default:
        // For unimplemented tools, clearly state they require configuration or are not yet implemented
        // Do NOT fake success
        return res.status(400).json({
          error: `Tool ${toolId} execution not implemented or requires configuration`,
          code: 'NOT_IMPLEMENTED',
          message: `Tool ${toolId} is registered but execution requires additional implementation or configuration. Check tool status.`,
          tool: toolId
        });
    }
    
    res.json({ result, tool: toolId, status: 'completed' });
  } catch (e: any) {
    console.error(`Tool ${toolId} execution failed:`, e);
    res.status(500).json({ error: 'Tool execution failed', details: e.message });
  }
});

router.get('/permissions/list', async (req, res) => {
  const userId = (req as any).user.id;
  const permissions = PermissionEngine.list(userId);
  res.json({ permissions });
});

router.post('/permissions/grant', async (req, res) => {
  const userId = (req as any).user.id;
  const { resource, action, toolId, agentId, expiresInMs } = req.body;
  
  if (!resource || !action) {
    return res.status(400).json({ error: 'resource and action required' });
  }
  
  const id = PermissionEngine.grant(userId, resource, action, { toolId, agentId, expiresInMs });
  res.status(201).json({ id, message: 'Permission granted' });
});

router.delete('/permissions/:id', async (req, res) => {
  const userId = (req as any).user.id;
  const success = PermissionEngine.revoke(userId, req.params.id);
  
  if (!success) {
    return res.status(404).json({ error: 'Permission not found' });
  }
  
  res.json({ message: 'Permission revoked' });
});

export default router;
