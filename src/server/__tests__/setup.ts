import fs from 'fs';
import { runMigrations, closeDb } from '../db/index.js';

const TEST_DB = './data/test.db';

export function setupTestDb() {
  // Ensure clean DB
  try { closeDb(); } catch {}
  if (fs.existsSync(TEST_DB)) {
    try { fs.unlinkSync(TEST_DB); } catch {}
  }
  process.env.DATABASE_PATH = TEST_DB;
  process.env.JWT_SECRET = 'test-jwt-secret-key-32-chars-minimum-length-secure';
  runMigrations();
}

export function cleanupTestDb() {
  try { closeDb(); } catch {}
  if (fs.existsSync(TEST_DB)) {
    try { fs.unlinkSync(TEST_DB); } catch {}
  }
}
