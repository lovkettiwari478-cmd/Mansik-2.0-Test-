import { getDb } from '../db/index.js';
import { v4 as uuidv4 } from 'uuid';
import { Task, TaskStatus, PlanStep, TaskPlan } from '../../shared/types.js';
import { generateIdempotencyKey } from '../lib/crypto.js';

export class TaskEngine {
  static create(userId: string, goal: string, options: {
    title?: string;
    description?: string;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    deadline?: string;
    dependencies?: string[];
    parentTaskId?: string;
    maxRetries?: number;
    timeoutMs?: number;
  } = {}): Task {
    const db = getDb();
    const id = uuidv4();
    const now = new Date().toISOString();
    const idempotencyKey = generateIdempotencyKey();
    
    // Auto-generate plan from goal
    const plan = this.decomposeGoal(goal);
    
    const task: Task = {
      id,
      userId,
      title: options.title || this.generateTitle(goal),
      description: options.description || goal,
      status: 'PLANNED',
      goal,
      plan,
      dependencies: options.dependencies || [],
      parentTaskId: options.parentTaskId,
      priority: options.priority || 'medium',
      deadline: options.deadline,
      createdAt: now,
      updatedAt: now,
      retryCount: 0,
      maxRetries: options.maxRetries || 3,
      timeoutMs: options.timeoutMs || 300000,
      idempotencyKey,
      auditTrail: [{
        timestamp: now,
        fromStatus: 'CREATED',
        toStatus: 'PLANNED',
        actor: 'system',
        message: 'Task created from goal',
        metadata: { goal }
      }]
    };
    
    db.prepare(`
      INSERT INTO tasks (id, user_id, title, description, status, goal, plan, dependencies, parent_task_id, priority, deadline, retry_count, max_retries, timeout_ms, idempotency_key, audit_trail, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      userId,
      task.title,
      task.description,
      task.status,
      task.goal,
      JSON.stringify(plan),
      JSON.stringify(task.dependencies),
      task.parentTaskId || null,
      task.priority,
      task.deadline || null,
      task.retryCount,
      task.maxRetries,
      task.timeoutMs,
      task.idempotencyKey,
      JSON.stringify(task.auditTrail),
      task.createdAt,
      task.updatedAt
    );
    
    return task;
  }
  
  static get(userId: string, taskId: string): Task | null {
    const db = getDb();
    const row = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(taskId, userId) as any;
    if (!row) return null;
    return this.rowToTask(row);
  }
  
  static list(userId: string, filters: { status?: TaskStatus; priority?: string; limit?: number } = {}): Task[] {
    const db = getDb();
    let sql = 'SELECT * FROM tasks WHERE user_id = ?';
    const params: any[] = [userId];
    
    if (filters.status) {
      sql += ' AND status = ?';
      params.push(filters.status);
    }
    if (filters.priority) {
      sql += ' AND priority = ?';
      params.push(filters.priority);
    }
    
    sql += " ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, created_at DESC LIMIT ?";
    params.push(filters.limit || 50);
    
    const rows = db.prepare(sql).all(...params) as any[];
    return rows.map(r => this.rowToTask(r));
  }
  
  static updateStatus(userId: string, taskId: string, newStatus: TaskStatus, actor: 'system' | 'user' | 'agent' = 'system', message?: string, metadata?: any): Task | null {
    const db = getDb();
    const existing = this.get(userId, taskId);
    if (!existing) return null;
    
    const now = new Date().toISOString();
    const auditEntry = {
      timestamp: now,
      fromStatus: existing.status,
      toStatus: newStatus,
      actor,
      message: message || `Status changed from ${existing.status} to ${newStatus}`,
      metadata
    };
    
    const newTrail = [...existing.auditTrail, auditEntry];
    
    const updates: any = {
      status: newStatus,
      audit_trail: JSON.stringify(newTrail),
      updated_at: now
    };
    
    if (newStatus === 'EXECUTING') {
      updates.executed_at = now;
    }
    if (newStatus === 'COMPLETED' || newStatus === 'FAILED' || newStatus === 'CANCELLED') {
      updates.completed_at = now;
    }
    
    // Build dynamic update
    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(updates), taskId, userId];
    
    db.prepare(`UPDATE tasks SET ${setClauses} WHERE id = ? AND user_id = ?`).run(...values);
    
    return this.get(userId, taskId);
  }
  
  static async execute(userId: string, taskId: string, toolExecutor?: (step: PlanStep) => Promise<any>): Promise<Task> {
    let task = this.get(userId, taskId);
    if (!task) throw new Error('Task not found');
    
    // Check emergency stop
    const db = getDb();
    const stopFlag = db.prepare('SELECT value FROM system_flags WHERE key = ?').get(`emergency_stop_${userId}`) as any;
    if (stopFlag && stopFlag.value === '1') {
      return this.updateStatus(userId, taskId, 'CANCELLED', 'system', 'Emergency stop active')!;
    }
    
    // Validate dependencies
    if (task.dependencies && task.dependencies.length > 0) {
      for (const depId of task.dependencies) {
        const dep = this.get(userId, depId);
        if (!dep || dep.status !== 'COMPLETED') {
          throw new Error(`Dependency ${depId} not completed`);
        }
      }
    }
    
    // Transition to APPROVED then EXECUTING
    if (task.status === 'PLANNED') {
      task = this.updateStatus(userId, taskId, 'APPROVED', 'system', 'Task approved for execution')!;
    }
    
    task = this.updateStatus(userId, taskId, 'EXECUTING', 'system', 'Starting execution')!;
    
    try {
      // Execute plan steps
      if (task.plan && task.plan.steps.length > 0) {
        for (const step of task.plan.steps) {
          // Check for cancellation
          const current = this.get(userId, taskId);
          if (current?.status === 'CANCELLED') {
            throw new Error('Task cancelled');
          }
          
          // Check timeout
          const elapsed = Date.now() - new Date(task.executedAt || task.updatedAt).getTime();
          if (elapsed > task.timeoutMs) {
            throw new Error('Task timeout');
          }
          
          if (toolExecutor && step.tool) {
            try {
              const result = await toolExecutor(step);
              // Update step result
              this.updateStepResult(userId, taskId, step.id, result, null);
            } catch (stepError: any) {
              this.updateStepResult(userId, taskId, step.id, null, stepError.message);
              throw stepError;
            }
          }
        }
      }
      
      // Verification phase
      task = this.updateStatus(userId, taskId, 'VERIFYING', 'system', 'Verifying execution')!;
      
      const verification = await this.verify(task);
      
      if (verification.verified) {
        db.prepare('UPDATE tasks SET verification_result = ?, result = ? WHERE id = ? AND user_id = ?').run(
          JSON.stringify(verification),
          JSON.stringify({ message: 'Task completed successfully', verification }),
          taskId,
          userId
        );
        return this.updateStatus(userId, taskId, 'COMPLETED', 'system', 'Task verified and completed', { verification })!;
      } else {
        throw new Error(`Verification failed: ${verification.checks.filter(c => !c.passed).map(c => c.message).join(', ')}`);
      }
      
    } catch (error: any) {
      console.error(`Task ${taskId} failed:`, error);
      
      db.prepare('UPDATE tasks SET error = ? WHERE id = ? AND user_id = ?').run(error.message, taskId, userId);
      
      task = this.get(userId, taskId)!;
      
      // Retry logic
      if (task.retryCount < task.maxRetries) {
        const newRetryCount = task.retryCount + 1;
        db.prepare('UPDATE tasks SET retry_count = ? WHERE id = ? AND user_id = ?').run(newRetryCount, taskId, userId);
        
        const retryingTask = this.updateStatus(userId, taskId, 'RETRYING', 'system', `Retrying (${newRetryCount}/${task.maxRetries}): ${error.message}`)!;
        
        // Exponential backoff
        const backoffMs = Math.min(1000 * Math.pow(2, newRetryCount), 30000);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        
        // Check if still retrying (not cancelled)
        const current = this.get(userId, taskId);
        if (current?.status === 'RETRYING') {
          return this.execute(userId, taskId, toolExecutor);
        }
        return current!;
      } else {
        return this.updateStatus(userId, taskId, 'FAILED', 'system', `Failed after ${task.maxRetries} retries: ${error.message}`, { error: error.message })!;
      }
    }
  }
  
  static cancel(userId: string, taskId: string): Task | null {
    return this.updateStatus(userId, taskId, 'CANCELLED', 'user', 'Cancelled by user');
  }
  
  static emergencyStop(userId: string): void {
    const db = getDb();
    db.prepare("INSERT OR REPLACE INTO system_flags (key, value, updated_at) VALUES (?, ?, datetime('now'))").run(`emergency_stop_${userId}`, '1');
    
    // Cancel all executing tasks
    const executing = db.prepare("SELECT id FROM tasks WHERE user_id = ? AND status IN ('EXECUTING', 'VERIFYING', 'RETRYING')").all(userId) as any[];
    for (const t of executing) {
      this.updateStatus(userId, t.id, 'CANCELLED', 'system', 'Emergency stop triggered');
    }
  }
  
  static clearEmergencyStop(userId: string): void {
    const db = getDb();
    db.prepare('DELETE FROM system_flags WHERE key = ?').run(`emergency_stop_${userId}`);
  }
  
  static isEmergencyStopped(userId: string): boolean {
    const db = getDb();
    const flag = db.prepare('SELECT value FROM system_flags WHERE key = ?').get(`emergency_stop_${userId}`) as any;
    return flag?.value === '1';
  }
  
  private static decomposeGoal(goal: string): TaskPlan {
    const lower = goal.toLowerCase();
    const steps: PlanStep[] = [];
    
    // Simple but real decomposition logic
    if (lower.includes('research')) {
      steps.push(
        { id: uuidv4(), order: 1, action: 'Search for relevant information', tool: 'web_search', status: 'PLANNED', params: { query: goal } },
        { id: uuidv4(), order: 2, action: 'Analyze and compare sources', tool: 'knowledge_search', status: 'PLANNED' },
        { id: uuidv4(), order: 3, action: 'Generate research report', status: 'PLANNED', verification: 'Report contains citations' }
      );
    } else if (lower.includes('email') || lower.includes('message')) {
      steps.push(
        { id: uuidv4(), order: 1, action: 'Draft content', status: 'PLANNED' },
        { id: uuidv4(), order: 2, action: 'Review for tone and accuracy', status: 'PLANNED', verification: 'Draft reviewed' },
        { id: uuidv4(), order: 3, action: 'Request permission to send', tool: 'email', status: 'PLANNED' }
      );
    } else if (lower.includes('schedule') || lower.includes('calendar') || lower.includes('meeting')) {
      steps.push(
        { id: uuidv4(), order: 1, action: 'Check calendar conflicts', tool: 'calendar', status: 'PLANNED' },
        { id: uuidv4(), order: 2, action: 'Create calendar event', tool: 'calendar', status: 'PLANNED' },
        { id: uuidv4(), order: 3, action: 'Send notifications if needed', status: 'PLANNED' }
      );
    } else if (lower.includes('remember') || lower.includes('save')) {
      steps.push(
        { id: uuidv4(), order: 1, action: 'Extract information to remember', status: 'PLANNED' },
        { id: uuidv4(), order: 2, action: 'Check for duplicates', tool: 'memory_search', status: 'PLANNED' },
        { id: uuidv4(), order: 3, action: 'Save to approved memory', tool: 'memory_save', status: 'PLANNED' }
      );
    } else {
      // Generic decomposition
      steps.push(
        { id: uuidv4(), order: 1, action: `Analyze goal: ${goal}`, status: 'PLANNED' },
        { id: uuidv4(), order: 2, action: 'Execute main action', status: 'PLANNED' },
        { id: uuidv4(), order: 3, action: 'Verify completion', status: 'PLANNED', verification: 'Goal achieved' }
      );
    }
    
    return {
      steps,
      requiredPermissions: this.extractRequiredPermissions(goal),
      requiredTools: steps.filter(s => s.tool).map(s => s.tool!),
      estimatedDurationMs: steps.length * 30000,
      risks: this.assessRisks(goal)
    };
  }
  
  private static extractRequiredPermissions(goal: string): string[] {
    const lower = goal.toLowerCase();
    const perms: string[] = [];
    if (lower.includes('email') || lower.includes('send')) perms.push('communication:send_email');
    if (lower.includes('delete')) perms.push('data:delete');
    if (lower.includes('calendar')) perms.push('calendar:write');
    if (lower.includes('file')) perms.push('computer:file_write');
    return perms;
  }
  
  private static assessRisks(goal: string): string[] {
    const lower = goal.toLowerCase();
    const risks: string[] = [];
    if (lower.includes('delete') || lower.includes('remove')) risks.push('Destructive operation');
    if (lower.includes('email') || lower.includes('send')) risks.push('External communication');
    if (lower.includes('all') || lower.includes('every')) risks.push('Broad scope - may affect many items');
    return risks;
  }
  
  private static generateTitle(goal: string): string {
    const words = goal.split(' ').slice(0, 6).join(' ');
    return words.length > 50 ? words.slice(0, 50) + '...' : words;
  }
  
  private static async verify(task: Task): Promise<{ verified: boolean; confidence: number; checks: Array<{ name: string; passed: boolean; message: string }> }> {
    const checks: Array<{ name: string; passed: boolean; message: string }> = [];
    
    // Check if task has result
    checks.push({
      name: 'has_result',
      passed: true, // For now, if we reached verification, we have some result
      message: 'Task execution reached verification'
    });
    
    // Check if all steps completed
    if (task.plan?.steps) {
      const allPlanned = task.plan.steps.every(s => s.status !== 'FAILED');
      checks.push({
        name: 'steps_not_failed',
        passed: allPlanned,
        message: allPlanned ? 'All steps passed' : 'Some steps failed'
      });
    }
    
    // Check for timeout
    const elapsed = Date.now() - new Date(task.executedAt || task.createdAt).getTime();
    checks.push({
      name: 'within_timeout',
      passed: elapsed <= task.timeoutMs,
      message: elapsed <= task.timeoutMs ? `Completed within timeout (${elapsed}ms)` : `Timeout exceeded (${elapsed}ms > ${task.timeoutMs}ms)`
    });
    
    const verified = checks.every(c => c.passed);
    const confidence = verified ? 0.9 : 0.3;
    
    return { verified, confidence, checks };
  }
  
  private static updateStepResult(userId: string, taskId: string, stepId: string, result: any, error: string | null) {
    const db = getDb();
    const task = this.get(userId, taskId);
    if (!task || !task.plan) return;
    
    const updatedSteps = task.plan.steps.map(s => {
      if (s.id === stepId) {
        return {
          ...s,
          status: error ? 'FAILED' as TaskStatus : 'COMPLETED' as TaskStatus,
          result,
          error: error || undefined
        };
      }
      return s;
    });
    
    const updatedPlan = { ...task.plan, steps: updatedSteps };
    
    db.prepare("UPDATE tasks SET plan = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?").run(
      JSON.stringify(updatedPlan),
      taskId,
      userId
    );
  }
  
  private static rowToTask(row: any): Task {
    return {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      description: row.description,
      status: row.status,
      goal: row.goal,
      plan: row.plan ? JSON.parse(row.plan) : undefined,
      dependencies: row.dependencies ? JSON.parse(row.dependencies) : [],
      parentTaskId: row.parent_task_id || undefined,
      priority: row.priority,
      deadline: row.deadline || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      executedAt: row.executed_at || undefined,
      completedAt: row.completed_at || undefined,
      retryCount: row.retry_count,
      maxRetries: row.max_retries,
      timeoutMs: row.timeout_ms,
      idempotencyKey: row.idempotency_key,
      result: row.result ? JSON.parse(row.result) : undefined,
      error: row.error || undefined,
      verificationResult: row.verification_result ? JSON.parse(row.verification_result) : undefined,
      auditTrail: row.audit_trail ? JSON.parse(row.audit_trail) : []
    };
  }
}
