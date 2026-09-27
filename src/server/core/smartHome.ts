// Smart Home Architecture - clean interfaces for future integrations, does NOT pretend hardware exists

import { getDb } from '../db/index.js';
import { v4 as uuidv4 } from 'uuid';

export interface SmartDevice {
  id: string;
  userId: string;
  name: string;
  type: 'light' | 'ac' | 'fan' | 'tv' | 'sensor' | 'camera' | 'lock' | 'thermostat' | 'other';
  provider: string;
  status: 'online' | 'offline' | 'error';
  state: Record<string, any>;
  room?: string;
  capabilities: string[];
  lastSeenAt?: string;
}

export interface SmartRoutine {
  id: string;
  userId: string;
  name: string;
  trigger: string; // e.g., "owner_presence", "time:22:00", "mode:sleep"
  actions: Array<{ deviceId: string; action: string; params?: any }>;
  isEnabled: boolean;
}

export type HomeMode = 'Welcome Home' | 'Leaving Home' | 'Sleep Mode' | 'Study Mode' | 'Meeting Mode' | 'Movie Mode' | 'Energy Saver';

export class SmartHomeEngine {
  // Device management
  static listDevices(userId: string): SmartDevice[] {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM smart_home_devices WHERE user_id = ? ORDER BY room, name').all(userId) as any[];
    return rows.map(r => ({
      id: r.id,
      userId: r.user_id,
      name: r.name,
      type: r.type,
      provider: r.provider,
      status: r.status,
      state: r.state ? JSON.parse(r.state) : {},
      room: r.room,
      capabilities: r.capabilities ? JSON.parse(r.capabilities) : [],
      lastSeenAt: r.last_seen_at
    }));
  }
  
  static getDevice(userId: string, deviceId: string): SmartDevice | null {
    const db = getDb();
    const row = db.prepare('SELECT * FROM smart_home_devices WHERE id = ? AND user_id = ?').get(deviceId, userId) as any;
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      type: row.type,
      provider: row.provider,
      status: row.status,
      state: row.state ? JSON.parse(row.state) : {},
      room: row.room,
      capabilities: row.capabilities ? JSON.parse(row.capabilities) : [],
      lastSeenAt: row.last_seen_at
    };
  }
  
  static addDevice(userId: string, device: { name: string; type: SmartDevice['type']; provider: string; room?: string; capabilities?: string[] }): SmartDevice {
    const db = getDb();
    const id = uuidv4();
    const now = new Date().toISOString();
    
    db.prepare(`
      INSERT INTO smart_home_devices (id, user_id, name, type, provider, status, state, room, capabilities, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'offline', ?, ?, ?, ?, ?)
    `).run(
      id,
      userId,
      device.name,
      device.type,
      device.provider,
      JSON.stringify({}),
      device.room || null,
      JSON.stringify(device.capabilities || []),
      now,
      now
    );
    
    return this.getDevice(userId, id)!;
  }
  
  static controlDevice(userId: string, deviceId: string, action: string, params?: any): { success: boolean; message: string; requiresConfig?: boolean; simulated?: boolean } {
    const device = this.getDevice(userId, deviceId);
    if (!device) {
      return { success: false, message: 'Device not found' };
    }
    
    // Check if provider is configured
    const db = getDb();
    const integration = db.prepare('SELECT status FROM integrations WHERE user_id = ? AND provider = ?').get(userId, device.provider) as any;
    
    if (!integration || integration.status !== 'connected') {
      return {
        success: false,
        message: `Device control requires configuration. Provider ${device.provider} is ${integration?.status || 'not configured'}. Please configure integration in settings. REQUIRES CONFIGURATION`,
        requiresConfig: true
      };
    }
    
    // In real implementation, would call provider API (e.g., SmartThings, Hue, Nest)
    // Currently simulates with state update - clearly marked as simulated, no hardware pretended
    const newState = { ...device.state, lastAction: action, ...params, updatedAt: new Date().toISOString(), simulated: true };
    
    db.prepare("UPDATE smart_home_devices SET state = ?, status = 'online', last_seen_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(
      JSON.stringify(newState),
      deviceId
    );
    
    return { 
      success: true, 
      message: `Device ${device.name} action ${action} simulated (no hardware connected, state updated locally). For real hardware control, configure provider ${device.provider} with actual device API. This is a simulated execution, not actual hardware control.`,
      simulated: true
    };
  }
  
  static removeDevice(userId: string, deviceId: string): boolean {
    const db = getDb();
    const result = db.prepare('DELETE FROM smart_home_devices WHERE id = ? AND user_id = ?').run(deviceId, userId);
    return result.changes > 0;
  }
  
  // Routines
  static listRoutines(userId: string): SmartRoutine[] {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM smart_home_routines WHERE user_id = ?').all(userId) as any[];
    return rows.map(r => ({
      id: r.id,
      userId: r.user_id,
      name: r.name,
      trigger: r.trigger,
      actions: JSON.parse(r.actions),
      isEnabled: !!r.is_enabled
    }));
  }
  
  static createRoutine(userId: string, routine: { name: string; trigger: string; actions: SmartRoutine['actions'] }): SmartRoutine {
    const db = getDb();
    const id = uuidv4();
    const now = new Date().toISOString();
    
    db.prepare(`
      INSERT INTO smart_home_routines (id, user_id, name, trigger, actions, is_enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `).run(id, userId, routine.name, routine.trigger, JSON.stringify(routine.actions), now, now);
    
    return {
      id,
      userId,
      name: routine.name,
      trigger: routine.trigger,
      actions: routine.actions,
      isEnabled: true
    };
  }
  
  static deleteRoutine(userId: string, routineId: string): boolean {
    const db = getDb();
    const result = db.prepare('DELETE FROM smart_home_routines WHERE id = ? AND user_id = ?').run(routineId, userId);
    return result.changes > 0;
  }
  
  // Modes
  static activateMode(userId: string, mode: HomeMode): { success: boolean; message: string; actionsExecuted: number } {
    const routines = this.listRoutines(userId).filter(r => r.trigger.toLowerCase().includes(mode.toLowerCase().split(' ')[0]) && r.isEnabled);
    
    let executed = 0;
    for (const routine of routines) {
      for (const action of routine.actions) {
        const result = this.controlDevice(userId, action.deviceId, action.action, action.params);
        if (result.success) executed++;
      }
    }
    
    // Even if no routines, return success with message about configuration
    if (routines.length === 0) {
      return {
        success: true,
        message: `Mode ${mode} activated. No routines configured for this mode - create routines in Smart Home settings. ${this.listDevices(userId).length === 0 ? 'No devices connected. REQUIRES CONFIGURATION: Add smart home provider integration.' : ''}`,
        actionsExecuted: 0
      };
    }
    
    return {
      success: true,
      message: `Mode ${mode} activated, executed ${executed} actions from ${routines.length} routines`,
      actionsExecuted: executed
    };
  }
  
  static detectForgottenDevices(userId: string): Array<{ device: SmartDevice; message: string }> {
    const devices = this.listDevices(userId);
    const forgotten: Array<{ device: SmartDevice; message: string }> = [];
    
    for (const device of devices) {
      if (device.state?.power === 'on' || device.state?.on === true) {
        // Check if device has been on for long time (simulate)
        const lastUpdate = device.lastSeenAt ? new Date(device.lastSeenAt) : new Date();
        const hoursOn = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60);
        
        if (hoursOn > 12) {
          forgotten.push({
            device,
            message: `Device ${device.name} has been on for ${Math.floor(hoursOn)} hours - may have been forgotten`
          });
        }
      }
    }
    
    return forgotten;
  }
  
  static getSecurityEvents(userId: string): Array<{ type: string; message: string; timestamp: string; severity: string }> {
    // In real implementation, would check camera, locks, sensors
    // Return empty but with honest status
    return [
      {
        type: 'info',
        message: 'Security monitoring requires camera/device permissions and hardware integration. No hardware connected. REQUIRES CONFIGURATION.',
        timestamp: new Date().toISOString(),
        severity: 'low'
      }
    ];
  }
}
