import { createApp } from './app.js';
import { config } from './config.js';
import { runMigrations } from './db/index.js';
import { BackgroundEngine } from './core/backgroundEngine.js';
import { SkillRegistry } from './core/skillRegistry.js';
import { MemoryEngine } from './core/memoryEngine.js';
import { PermissionEngine } from './middleware/permissionFirewall.js';
import fs from 'fs';

async function main() {
  console.log('Starting MANISK OS v' + config.version);
  console.log('Environment:', config.nodeEnv);
  
  // Ensure data directory
  if (!fs.existsSync('./data')) {
    fs.mkdirSync('./data', { recursive: true });
  }
  if (!fs.existsSync('./data/uploads')) {
    fs.mkdirSync('./data/uploads', { recursive: true });
  }
  
  // Run migrations
  console.log('Running database migrations...');
  runMigrations();
  
  // Seed system skills
  console.log('Seeding system skills...');
  SkillRegistry.seedSystemSkills();
  
  // Start background engine
  console.log('Starting background engine...');
  BackgroundEngine.start();
  
  // Periodic cleanup
  setInterval(() => {
    try {
      MemoryEngine.cleanupExpired();
      PermissionEngine.cleanupExpired();
      BackgroundEngine.cleanupOldJobs();
    } catch (e) {
      console.warn('Cleanup failed:', e);
    }
  }, 60 * 60 * 1000); // Every hour
  
  const app = createApp();
  
  const server = app.listen(config.port, '0.0.0.0', () => {
    console.log(`MANISK OS server listening on 0.0.0.0:${config.port}`);
    console.log(`Health check: http://localhost:${config.port}/api/health`);
  });
  
  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down...');
    BackgroundEngine.stop();
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
  
  process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down...');
    BackgroundEngine.stop();
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
}

main().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
