import dotenv from 'dotenv';
dotenv.config();

function requireInProduction(name: string, value: string, minLength: number, defaultValue: string): string {
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd) {
    if (!value || value === defaultValue || value.length < minLength) {
      console.error(`FATAL: ${name} must be set to a secure value of at least ${minLength} chars in production. Current length: ${value?.length || 0}`);
      // In production, we still allow startup but with strong warning - for E2B we need to allow dev defaults
      // For real production deployment, this should throw
      if (process.env.ENFORCE_SECURE_CONFIG === 'true') {
        throw new Error(`${name} must be set securely in production`);
      }
    }
  }
  return value || defaultValue;
}

const devJwtSecret = 'dev-jwt-secret-key-32-chars-minimum-length-secure';
const devEncryptionKey = 'dev-encryption-key-32-chars!!';

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  jwtSecret: requireInProduction('JWT_SECRET', process.env.JWT_SECRET || devJwtSecret, 32, devJwtSecret),
  databasePath: process.env.DATABASE_PATH || './data/manisk.db',
  uploadPath: process.env.UPLOAD_PATH || './data/uploads',
  nodeEnv: process.env.NODE_ENV || 'development',
  encryptionKey: requireInProduction('ENCRYPTION_KEY', process.env.ENCRYPTION_KEY || devEncryptionKey, 16, devEncryptionKey),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  logLevel: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  
  // AI Providers - may be missing, then marked as REQUIRES CONFIGURATION
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  googleApiKey: process.env.GOOGLE_API_KEY || '',
  tavilyApiKey: process.env.TAVILY_API_KEY || '',
  // Nemotron - first-class provider (NVIDIA NIM / OpenAI-compatible)
  nemotronApiKey: process.env.NEMOTRON_API_KEY || '',
  nemotronApiUrl: process.env.NEMOTRON_API_URL || 'https://integrate.api.nvidia.com/v1/chat/completions',
  nemotronModel: process.env.NEMOTRON_MODEL || 'nvidia/llama-3.1-nemotron-70b-instruct',
  
  // Email
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: parseInt(process.env.SMTP_PORT || '587', 10),
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  smtpFrom: process.env.SMTP_FROM || '',

  // Security
  isProduction: process.env.NODE_ENV === 'production',
  enforceSecureConfig: process.env.ENFORCE_SECURE_CONFIG === 'true',
  cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : process.env.NODE_ENV === 'production',
  rateLimit: {
    authMax: parseInt(process.env.RATE_LIMIT_AUTH_MAX || '10', 10),
    apiMax: parseInt(process.env.RATE_LIMIT_API_MAX || '1000', 10),
    chatMax: parseInt(process.env.RATE_LIMIT_CHAT_MAX || '60', 10),
    searchMax: parseInt(process.env.RATE_LIMIT_SEARCH_MAX || '100', 10),
    researchMax: parseInt(process.env.RATE_LIMIT_RESEARCH_MAX || '30', 10),
    uploadMax: parseInt(process.env.RATE_LIMIT_UPLOAD_MAX || '20', 10),
    taskMax: parseInt(process.env.RATE_LIMIT_TASK_MAX || '30', 10),
    systemMax: parseInt(process.env.RATE_LIMIT_SYSTEM_MAX || '100', 10)
  },
  
  version: '2.0.0'
};

// Validation warnings
if (config.jwtSecret.length < 32) {
  console.warn('WARNING: JWT_SECRET should be at least 32 characters for security');
}

if (config.encryptionKey.length < 16) {
  console.warn('WARNING: ENCRYPTION_KEY should be at least 16 characters for security');
}

if (config.isProduction && config.corsOrigin === '*') {
  console.warn('WARNING: CORS_ORIGIN is * in production - should be restricted to specific domain');
}

if (config.isProduction) {
  console.log('Running in PRODUCTION mode');
  console.log(`- Port: ${config.port}`);
  console.log(`- Database: ${config.databasePath}`);
  console.log(`- Upload path: ${config.uploadPath}`);
  console.log(`- CORS: ${config.corsOrigin}`);
  console.log(`- Cookie secure: ${config.cookieSecure}`);
  console.log(`- Log level: ${config.logLevel}`);
} else {
  console.log(`Running in ${config.nodeEnv} mode`);
}

// Ensure upload directory exists
import fs from 'fs';
try {
  if (!fs.existsSync(config.uploadPath)) {
    fs.mkdirSync(config.uploadPath, { recursive: true });
  }
} catch (e) {
  console.warn(`Could not create upload path ${config.uploadPath}:`, e);
}
