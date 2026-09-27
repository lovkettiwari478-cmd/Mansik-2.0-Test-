import { getDb } from '../db/index.js';

export interface Prediction {
  type: 'routine_pattern' | 'deadline_risk' | 'schedule_conflict' | 'task_delay' | 'upcoming_preparation' | 'forgotten_task';
  title: string;
  description: string;
  confidence: number;
  severity: 'low' | 'medium' | 'high';
  suggestedAction?: string;
  relatedIds?: string[];
  timestamp: string;
}

export class PredictiveEngine {
  static getPredictions(userId: string): Prediction[] {
    const predictions: Prediction[] = [];
    const db = getDb();
    const now = new Date();
    
    // Deadline risk detection
    const upcomingDeadlines = db.prepare(`
      SELECT id, title, deadline, priority FROM tasks 
      WHERE user_id = ? AND status IN ('PLANNED', 'APPROVED', 'EXECUTING') AND deadline IS NOT NULL
      AND deadline <= datetime('now', '+3 days')
      ORDER BY deadline ASC LIMIT 10
    `).all(userId) as any[];
    
    for (const task of upcomingDeadlines) {
      const deadline = new Date(task.deadline);
      const hoursUntil = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);
      
      if (hoursUntil < 24 && task.priority !== 'low') {
        predictions.push({
          type: 'deadline_risk',
          title: `Deadline risk: ${task.title}`,
          description: `Task "${task.title}" deadline is in ${Math.ceil(hoursUntil)} hours. This is a prediction, not a fact - please verify your schedule.`,
          confidence: hoursUntil < 6 ? 0.9 : 0.7,
          severity: hoursUntil < 6 ? 'high' : 'medium',
          suggestedAction: 'Consider prioritizing or rescheduling',
          relatedIds: [task.id],
          timestamp: new Date().toISOString()
        });
      }
    }
    
    // Schedule conflict detection
    const events = db.prepare(`
      SELECT id, title, start_time, end_time FROM calendar_events 
      WHERE user_id = ? AND start_time >= datetime('now') AND start_time <= datetime('now', '+7 days')
      ORDER BY start_time ASC
    `).all(userId) as any[];
    
    for (let i = 0; i < events.length - 1; i++) {
      const current = events[i];
      const next = events[i + 1];
      const currentEnd = new Date(current.end_time);
      const nextStart = new Date(next.start_time);
      
      if (currentEnd > nextStart) {
        predictions.push({
          type: 'schedule_conflict',
          title: `Schedule conflict detected`,
          description: `Events "${current.title}" and "${next.title}" overlap. Prediction: you may need to reschedule.`,
          confidence: 0.95,
          severity: 'high',
          suggestedAction: 'Reschedule one of the events',
          relatedIds: [current.id, next.id],
          timestamp: new Date().toISOString()
        });
      }
      
      // Tight schedule (less than 15 min gap)
      const gapMinutes = (nextStart.getTime() - currentEnd.getTime()) / (1000 * 60);
      if (gapMinutes > 0 && gapMinutes < 15) {
        predictions.push({
          type: 'schedule_conflict',
          title: `Tight schedule`,
          description: `Only ${Math.ceil(gapMinutes)} minutes between "${current.title}" and "${next.title}". Prediction: may cause delay.`,
          confidence: 0.7,
          severity: 'medium',
          suggestedAction: 'Consider adding buffer time',
          relatedIds: [current.id, next.id],
          timestamp: new Date().toISOString()
        });
      }
    }
    
    // Forgotten task detection (tasks not updated in 7 days but still planned)
    const forgotten = db.prepare(`
      SELECT id, title, updated_at FROM tasks 
      WHERE user_id = ? AND status = 'PLANNED' AND updated_at < datetime('now', '-7 days')
      LIMIT 5
    `).all(userId) as any[];
    
    for (const task of forgotten) {
      predictions.push({
        type: 'forgotten_task',
        title: `Possibly forgotten task: ${task.title}`,
        description: `Task "${task.title}" has been in PLANNED status for over 7 days. Prediction: it may have been forgotten.`,
        confidence: 0.6,
        severity: 'low',
        suggestedAction: 'Review and either execute or cancel',
        relatedIds: [task.id],
        timestamp: new Date().toISOString()
      });
    }
    
    // Routine pattern detection
    const routineTasks = db.prepare(`
      SELECT title, COUNT(*) as count, strftime('%w', created_at) as dayOfWeek FROM tasks 
      WHERE user_id = ? AND created_at > datetime('now', '-30 days')
      GROUP BY title, dayOfWeek HAVING count >= 3
      LIMIT 5
    `).all(userId) as any[];
    
    for (const routine of routineTasks) {
      predictions.push({
        type: 'routine_pattern',
        title: `Routine detected: ${routine.title}`,
        description: `You create task "${routine.title}" frequently (${routine.count} times). Prediction: this might be a routine you want to automate.`,
        confidence: 0.65,
        severity: 'low',
        suggestedAction: 'Consider creating an automation',
        timestamp: new Date().toISOString()
      });
    }
    
    // Upcoming event preparation
    const upcomingImportant = db.prepare(`
      SELECT id, title, start_time FROM calendar_events 
      WHERE user_id = ? AND start_time >= datetime('now', '+1 hour') AND start_time <= datetime('now', '+24 hours')
      ORDER BY start_time ASC LIMIT 3
    `).all(userId) as any[];
    
    for (const event of upcomingImportant) {
      predictions.push({
        type: 'upcoming_preparation',
        title: `Prepare for: ${event.title}`,
        description: `Event "${event.title}" is coming up at ${new Date(event.start_time).toLocaleString()}. Prediction: you may want to prepare.`,
        confidence: 0.8,
        severity: 'medium',
        suggestedAction: 'Review event details and prepare materials',
        relatedIds: [event.id],
        timestamp: new Date().toISOString()
      });
    }
    
    return predictions.sort((a, b) => {
      const severityOrder = { high: 0, medium: 1, low: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }
}
