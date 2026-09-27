export interface VerificationResult {
  verified: boolean;
  confidence: number;
  checks: Array<{ name: string; passed: boolean; message: string; evidence?: any }>;
  timestamp: string;
}

export class VerificationEngine {
  static verifyToolResult(tool: string, result: any, expected?: any): VerificationResult {
    const checks: VerificationResult['checks'] = [];
    
    // Basic existence check
    checks.push({
      name: 'result_exists',
      passed: result !== null && result !== undefined,
      message: result ? 'Result exists' : 'No result returned',
      evidence: result ? 'present' : 'missing'
    });
    
    // Tool-specific verifications
    switch (tool) {
      case 'web_search':
        checks.push({
          name: 'has_sources',
          passed: Array.isArray(result) && result.length > 0,
          message: Array.isArray(result) && result.length > 0 ? `Found ${result.length} sources` : 'No sources found',
          evidence: result
        });
        break;
      case 'memory_save':
        checks.push({
          name: 'memory_id_present',
          passed: !!result?.id,
          message: result?.id ? `Memory saved with ID ${result.id}` : 'No memory ID',
          evidence: result
        });
        break;
      case 'task_create':
        checks.push({
          name: 'task_id_present',
          passed: !!result?.taskId || !!result?.id,
          message: result?.taskId ? 'Task created' : 'Task creation failed',
          evidence: result
        });
        break;
      case 'calendar':
        checks.push({
          name: 'calendar_valid',
          passed: !!result,
          message: result ? 'Calendar operation completed' : 'Calendar operation failed'
        });
        break;
    }
    
    // Error check
    if (result?.error) {
      checks.push({
        name: 'no_error',
        passed: false,
        message: `Error in result: ${result.error}`,
        evidence: result.error
      });
    } else {
      checks.push({
        name: 'no_error',
        passed: true,
        message: 'No errors detected'
      });
    }
    
    const verified = checks.every(c => c.passed);
    
    return {
      verified,
      confidence: verified ? 0.9 : 0.3,
      checks,
      timestamp: new Date().toISOString()
    };
  }
  
  static verifyPlan(plan: any): VerificationResult {
    const checks: VerificationResult['checks'] = [];
    
    checks.push({
      name: 'plan_exists',
      passed: !!plan,
      message: plan ? 'Plan exists' : 'No plan provided'
    });
    
    if (plan?.steps) {
      checks.push({
        name: 'has_steps',
        passed: Array.isArray(plan.steps) && plan.steps.length > 0,
        message: `Plan has ${plan.steps?.length || 0} steps`
      });
      
      const hasInvalidDeps = plan.steps.some((s: any) => s.dependsOn && !Array.isArray(s.dependsOn));
      checks.push({
        name: 'valid_dependencies',
        passed: !hasInvalidDeps,
        message: hasInvalidDeps ? 'Invalid dependencies found' : 'Dependencies valid'
      });
    }
    
    const verified = checks.every(c => c.passed);
    
    return {
      verified,
      confidence: verified ? 0.85 : 0.2,
      checks,
      timestamp: new Date().toISOString()
    };
  }
  
  static detectContradiction(text1: string, text2: string): { hasContradiction: boolean; explanation?: string } {
    const lower1 = text1.toLowerCase();
    const lower2 = text2.toLowerCase();
    
    // Simple contradiction patterns
    const contradictions = [
      { pattern: ['i like', "i don't like"], reason: 'Preference contradiction' },
      { pattern: ['i am', 'i am not'], reason: 'Identity contradiction' },
      { pattern: ['always', 'never'], reason: 'Absolute contradiction' },
      { pattern: ['remember', 'forget'], reason: 'Memory operation contradiction' }
    ];
    
    for (const { pattern, reason } of contradictions) {
      if ((lower1.includes(pattern[0]) && lower2.includes(pattern[1])) ||
          (lower1.includes(pattern[1]) && lower2.includes(pattern[0]))) {
        return { hasContradiction: true, explanation: reason };
      }
    }
    
    return { hasContradiction: false };
  }
}
