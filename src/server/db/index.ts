import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { createRequire } from 'module';

interface Statement {
  get: (...params: any[]) => any;
  all: (...params: any[]) => any[];
  run: (...params: any[]) => { changes: number; lastInsertRowid: number };
}

class WrappedDatabase {
  private db: any;
  public _dbPath: string;
  private dbType: 'node' | 'better-sqlite3' | 'sqlite3' = 'node';
  
  constructor(dbPath: string) {
    this._dbPath = dbPath;
    
    // Try Node's built-in sqlite (Node 22.5+)
    let DatabaseSync: any;
    try {
      const require = createRequire(import.meta.url);
      const mod = require('node:sqlite');
      DatabaseSync = mod.DatabaseSync;
      this.db = new DatabaseSync(dbPath);
      this.dbType = 'node';
      console.log('Using node:sqlite (Node built-in)');
    } catch (e) {
      try {
        // @ts-ignore
        const mod = (0, eval)("require")('node:sqlite');
        DatabaseSync = mod.DatabaseSync;
        this.db = new DatabaseSync(dbPath);
        this.dbType = 'node';
        console.log('Using node:sqlite via eval');
      } catch (e2) {
        // Fallback to better-sqlite3 for free hosts that don't have Node 22.5+
        try {
          const require = createRequire(import.meta.url);
          const BetterSqlite3 = require('better-sqlite3');
          this.db = new BetterSqlite3(dbPath);
          this.dbType = 'better-sqlite3';
          console.log('Using better-sqlite3 fallback (for free hosts without Node 22.5+)');
        } catch (e3) {
          // Last fallback to sqlite3 package
          try {
            const require = createRequire(import.meta.url);
            const sqlite3 = require('sqlite3');
            // sqlite3 is callback-based, we need to use verbose and wrap
            // For simplicity, throw error asking to install better-sqlite3
            throw new Error('sqlite3 callback API not yet wrapped, use better-sqlite3');
          } catch (e4) {
            throw new Error(
              'No SQLite implementation available. Requires either:\n' +
              '- Node 22.5+ with node:sqlite (recommended), or\n' +
              '- better-sqlite3 package (npm install better-sqlite3) for free hosts like Replit/Glitch without Node 22\n' +
              `Errors: node:sqlite: ${(e as any).message} | ${(e2 as any).message} | better-sqlite3: ${(e3 as any).message}`
            );
          }
        }
      }
    }
    
    // Enable WAL and foreign keys
    try {
      if (this.dbType === 'node') {
        this.db.exec('PRAGMA journal_mode = WAL;');
        this.db.exec('PRAGMA foreign_keys = ON;');
      } else if (this.dbType === 'better-sqlite3') {
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('foreign_keys = ON');
      }
    } catch {}
  }
  
  exec(sql: string) {
    if (this.dbType === 'node') {
      return this.db.exec(sql);
    } else {
      // better-sqlite3
      return this.db.exec(sql);
    }
  }
  
  prepare(sql: string): Statement {
    if (this.dbType === 'node') {
      const stmt = this.db.prepare(sql);
      return {
        get: (...params: any[]) => {
          try {
            return stmt.get(...params) || null;
          } catch (e) {
            return null;
          }
        },
        all: (...params: any[]) => {
          try {
            return stmt.all(...params) || [];
          } catch {
            return [];
          }
        },
        run: (...params: any[]) => {
          const result = stmt.run(...params);
          return {
            changes: result.changes || 0,
            lastInsertRowid: Number(result.lastInsertRowid || 0)
          };
        }
      };
    } else {
      // better-sqlite3
      const stmt = this.db.prepare(sql);
      return {
        get: (...params: any[]) => {
          try {
            return stmt.get(...params) || null;
          } catch (e) {
            return null;
          }
        },
        all: (...params: any[]) => {
          try {
            return stmt.all(...params) || [];
          } catch {
            return [];
          }
        },
        run: (...params: any[]) => {
          try {
            const result = stmt.run(...params);
            return {
              changes: result.changes || 0,
              lastInsertRowid: Number(result.lastInsertRowid || 0)
            };
          } catch (e) {
            // For some statements that don't return changes, return 0
            return { changes: 0, lastInsertRowid: 0 };
          }
        }
      };
    }
  }
  
  pragma(pragma: string, options?: any) {
    try {
      if (this.dbType === 'node') {
        if (options) {
          return this.db.exec(`PRAGMA ${pragma} = ${options};`);
        }
        const stmt = this.db.prepare(`PRAGMA ${pragma};`);
        return stmt.get();
      } else {
        if (options) {
          return this.db.pragma(`${pragma} = ${options}`);
        }
        return this.db.pragma(pragma, { simple: true });
      }
    } catch {
      return null;
    }
  }
  
  transaction(fn: () => void) {
    if (this.dbType === 'node') {
      return () => {
        try {
          this.db.exec('BEGIN;');
          fn();
          this.db.exec('COMMIT;');
        } catch (e) {
          try { this.db.exec('ROLLBACK;'); } catch {}
          throw e;
        }
      };
    } else {
      // better-sqlite3 has transaction helper
      return this.db.transaction(fn);
    }
  }
  
  close() {
    try { this.db.close(); } catch {}
  }
}

let db: WrappedDatabase | null = null;

export function getDb(): WrappedDatabase {
  if (db) {
    const currentPath = path.resolve(process.env.DATABASE_PATH || config.databasePath);
    const existingPath = (db as any)._dbPath;
    if (existingPath && existingPath !== currentPath) {
      try { db.close(); } catch {}
      db = null;
    } else if (existingPath) {
      return db;
    } else if (!existingPath) {
      return db;
    }
  }
  
  const dbPath = path.resolve(process.env.DATABASE_PATH || config.databasePath);
  const dir = path.dirname(dbPath);
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  db = new WrappedDatabase(dbPath);
  
  return db;
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

// Migration system
export function runMigrations() {
  const database = getDb();
  
  database.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      executed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  
  const migrations: Array<{ name: string; sql: string }> = [
    {
      name: '001_initial_schema',
      sql: `
        -- Users
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          name TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'user',
          preferences TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          last_login_at TEXT,
          is_active INTEGER NOT NULL DEFAULT 1
        );
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

        -- Sessions
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash TEXT NOT NULL,
          device_info TEXT,
          ip_address TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          expires_at TEXT NOT NULL,
          revoked_at TEXT,
          last_active_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);

        -- Permissions
        CREATE TABLE IF NOT EXISTS permissions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          agent_id TEXT,
          tool_id TEXT,
          resource TEXT NOT NULL,
          action TEXT NOT NULL,
          granted INTEGER NOT NULL DEFAULT 0,
          granted_at TEXT,
          expires_at TEXT,
          is_temporary INTEGER NOT NULL DEFAULT 0,
          granted_by TEXT NOT NULL DEFAULT 'user',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_permissions_user_id ON permissions(user_id);
        CREATE INDEX IF NOT EXISTS idx_permissions_resource ON permissions(resource, action);

        -- Conversations
        CREATE TABLE IF NOT EXISTS conversations (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          message_count INTEGER NOT NULL DEFAULT 0,
          summary TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);

        -- Messages
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          intent TEXT,
          tool_calls TEXT,
          memories_used TEXT,
          tasks_created TEXT,
          model_used TEXT,
          citations TEXT,
          verified INTEGER DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
        CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);

        -- Memories
        CREATE TABLE IF NOT EXISTS memories (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          type TEXT NOT NULL,
          content TEXT NOT NULL,
          embedding TEXT,
          embedding_provider TEXT DEFAULT 'local',
          provenance TEXT NOT NULL,
          source TEXT NOT NULL,
          confidence REAL NOT NULL DEFAULT 1.0,
          tags TEXT,
          is_approved INTEGER NOT NULL DEFAULT 0,
          duplicate_of TEXT REFERENCES memories(id),
          metadata TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          expires_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_memories_user_id ON memories(user_id);
        CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
        CREATE INDEX IF NOT EXISTS idx_memories_is_approved ON memories(is_approved);

        -- Tasks
        CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'PLANNED',
          goal TEXT NOT NULL,
          plan TEXT,
          dependencies TEXT,
          parent_task_id TEXT REFERENCES tasks(id),
          priority TEXT NOT NULL DEFAULT 'medium',
          deadline TEXT,
          retry_count INTEGER NOT NULL DEFAULT 0,
          max_retries INTEGER NOT NULL DEFAULT 3,
          timeout_ms INTEGER NOT NULL DEFAULT 300000,
          idempotency_key TEXT,
          result TEXT,
          error TEXT,
          verification_result TEXT,
          audit_trail TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          executed_at TEXT,
          completed_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
        CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
        CREATE INDEX IF NOT EXISTS idx_tasks_idempotency ON tasks(idempotency_key);

        -- Audit Logs
        CREATE TABLE IF NOT EXISTS audit_logs (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          action TEXT NOT NULL,
          resource TEXT NOT NULL,
          resource_id TEXT,
          status TEXT NOT NULL,
          timestamp TEXT NOT NULL DEFAULT (datetime('now')),
          ip TEXT,
          user_agent TEXT,
          request_id TEXT NOT NULL,
          details TEXT,
          risk_level TEXT DEFAULT 'low'
        );
        CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

        -- Background Jobs
        CREATE TABLE IF NOT EXISTS background_jobs (
          id TEXT PRIMARY KEY,
          user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
          type TEXT NOT NULL,
          payload TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'queued',
          priority INTEGER NOT NULL DEFAULT 0,
          attempts INTEGER NOT NULL DEFAULT 0,
          max_attempts INTEGER NOT NULL DEFAULT 3,
          progress REAL DEFAULT 0,
          progress_message TEXT,
          result TEXT,
          error TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          scheduled_at TEXT NOT NULL DEFAULT (datetime('now')),
          started_at TEXT,
          completed_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_jobs_status ON background_jobs(status);
        CREATE INDEX IF NOT EXISTS idx_jobs_scheduled_at ON background_jobs(scheduled_at);
        CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON background_jobs(user_id);

        -- Calendar Events
        CREATE TABLE IF NOT EXISTS calendar_events (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          description TEXT,
          start_time TEXT NOT NULL,
          end_time TEXT NOT NULL,
          location TEXT,
          attendees TEXT,
          status TEXT NOT NULL DEFAULT 'confirmed',
          source TEXT NOT NULL DEFAULT 'local',
          external_id TEXT,
          recurrence TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_calendar_user_id ON calendar_events(user_id);
        CREATE INDEX IF NOT EXISTS idx_calendar_start_time ON calendar_events(start_time);

        -- Documents
        CREATE TABLE IF NOT EXISTS documents (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          type TEXT NOT NULL,
          content TEXT,
          file_path TEXT,
          mime_type TEXT,
          size INTEGER,
          embedding TEXT,
          tags TEXT,
          source TEXT,
          duplicate_of TEXT REFERENCES documents(id),
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);

        -- Integrations
        CREATE TABLE IF NOT EXISTS integrations (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          provider TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'requires_config',
          config TEXT,
          last_sync_at TEXT,
          error TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_integrations_user_id ON integrations(user_id);
        CREATE INDEX IF NOT EXISTS idx_integrations_provider ON integrations(provider);

        -- Notifications
        CREATE TABLE IF NOT EXISTS notifications (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          message TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT 'info',
          priority TEXT NOT NULL DEFAULT 'medium',
          is_read INTEGER NOT NULL DEFAULT 0,
          action_url TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
        CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);

        -- Model Usage
        CREATE TABLE IF NOT EXISTS model_usage (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          provider TEXT NOT NULL,
          model TEXT NOT NULL,
          input_tokens INTEGER NOT NULL DEFAULT 0,
          output_tokens INTEGER NOT NULL DEFAULT 0,
          cost REAL NOT NULL DEFAULT 0,
          latency_ms INTEGER,
          request_id TEXT,
          timestamp TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_model_usage_user_id ON model_usage(user_id);
        CREATE INDEX IF NOT EXISTS idx_model_usage_provider ON model_usage(provider);

        -- Skills / Plugins
        CREATE TABLE IF NOT EXISTS skills (
          id TEXT PRIMARY KEY,
          user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          description TEXT NOT NULL,
          version TEXT NOT NULL DEFAULT '1.0.0',
          permissions TEXT NOT NULL DEFAULT '[]',
          tools TEXT NOT NULL DEFAULT '[]',
          is_enabled INTEGER NOT NULL DEFAULT 1,
          is_system INTEGER NOT NULL DEFAULT 0,
          config TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_skills_user_id ON skills(user_id);

        -- System emergency stop flag
        CREATE TABLE IF NOT EXISTS system_flags (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `
    },
    {
      name: '002_add_smart_home',
      sql: `
        CREATE TABLE IF NOT EXISTS smart_home_devices (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          provider TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'offline',
          state TEXT,
          room TEXT,
          capabilities TEXT,
          last_seen_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_smart_home_user_id ON smart_home_devices(user_id);

        CREATE TABLE IF NOT EXISTS smart_home_routines (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          trigger TEXT NOT NULL,
          actions TEXT NOT NULL,
          is_enabled INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `
    },
    {
      name: '003_security_hardening',
      sql: `
        -- Login attempts tracking for brute-force protection
        CREATE TABLE IF NOT EXISTS login_attempts (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL,
          ip_address TEXT,
          attempted_at TEXT NOT NULL DEFAULT (datetime('now')),
          success INTEGER NOT NULL DEFAULT 0,
          user_agent TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email);
        CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip_address);
        CREATE INDEX IF NOT EXISTS idx_login_attempts_attempted_at ON login_attempts(attempted_at);

        -- Account lockouts for progressive lockout
        CREATE TABLE IF NOT EXISTS account_lockouts (
          email TEXT PRIMARY KEY,
          failed_count INTEGER NOT NULL DEFAULT 0,
          first_failed_at TEXT,
          last_failed_at TEXT,
          locked_until TEXT,
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_lockouts_locked_until ON account_lockouts(locked_until);
      `
    }
  ];
  
  const existing = database.prepare('SELECT name FROM migrations').all() as Array<{ name: string }>;
  const existingSet = new Set(existing.map(m => m.name));
  
  for (const migration of migrations) {
    if (!existingSet.has(migration.name)) {
      console.log(`Running migration: ${migration.name}`);
      const tx = database.transaction(() => {
        database.exec(migration.sql);
        database.prepare('INSERT INTO migrations (name) VALUES (?)').run(migration.name);
      });
      tx();
      console.log(`Migration ${migration.name} completed`);
    }
  }
  
  console.log('All migrations completed');
}
