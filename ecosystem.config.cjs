const path = require('path');
const fs = require('fs');

// Load .env into process.env if values are not already set.
// Unlike server.sh, whose sourcing overwrites shell exports, this keeps a value
// already in the environment.
// This ensures PM2 auto-restarts (which bypass server.sh) still pick up PORT,
// FAST_STORAGE, SLOW_STORAGE, PM2_MAX_MEMORY, etc.
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) {
      // Strip surrounding quotes if present
      process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
}

// Derive PM2 app name from config files (mirrors server.sh priority):
//   1. ${FAST_STORAGE}/config/app-custom-config.json  ngdpbase.application-name
//   2. ./config/app-default-config.json               ngdpbase.application-name
//   3. PROJECT_NAME from .env
//   4. Directory basename
function readAppName() {
  // Resolve FAST_STORAGE relative to __dirname if it's a relative path
  const rawFast = process.env.FAST_STORAGE || process.env.INSTANCE_DATA_FOLDER || 'data';
  const fastStorage = path.isAbsolute(rawFast) ? rawFast : path.join(__dirname, rawFast);
  const candidates = [
    path.join(fastStorage, 'config', 'app-custom-config.json'),
    path.join(__dirname, 'config', 'app-default-config.json'),
  ];
  for (const cfgPath of candidates) {
    try {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      const name = cfg['ngdpbase.application-name'] || cfg['ngdpbase.applicationName'];
      if (name) return name;
    } catch (_) { /* file absent or unparseable — try next */ }
  }
  return process.env.PROJECT_NAME || path.basename(__dirname);
}
const appName = readAppName();

module.exports = {
  apps: [{
    name: appName,
    script: 'dist/src/app.js',
    cwd: __dirname,

    // Run pre-compiled JavaScript from dist/ (no tsx needed)
    // IMPORTANT: Run 'npm run build' before starting with PM2

    // Environment — PORT and storage paths read from .env above; forwarded
    // explicitly so PM2 auto-restarts inherit the correct values.
    env: {
      NODE_ENV: 'production',
      PORT: process.env.PORT || '3000',
      FAST_STORAGE: process.env.FAST_STORAGE || process.env.INSTANCE_DATA_FOLDER || './data',
      SLOW_STORAGE: process.env.SLOW_STORAGE || process.env.FAST_STORAGE || process.env.INSTANCE_DATA_FOLDER || './data'
    },
    env_development: {
      NODE_ENV: 'development',
      PORT: process.env.PORT || '3000',
      FAST_STORAGE: process.env.FAST_STORAGE || process.env.INSTANCE_DATA_FOLDER || './data',
      SLOW_STORAGE: process.env.SLOW_STORAGE || process.env.FAST_STORAGE || process.env.INSTANCE_DATA_FOLDER || './data'
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: process.env.PORT || '3000',
      FAST_STORAGE: process.env.FAST_STORAGE || process.env.INSTANCE_DATA_FOLDER || './data',
      SLOW_STORAGE: process.env.SLOW_STORAGE || process.env.FAST_STORAGE || process.env.INSTANCE_DATA_FOLDER || './data'
    },

    // Logging - use FAST_STORAGE (operational data dir), falling back to legacy INSTANCE_DATA_FOLDER
    out_file: path.join(process.env.FAST_STORAGE || process.env.INSTANCE_DATA_FOLDER || './data', 'logs/pm2-out.log'),
    error_file: path.join(process.env.FAST_STORAGE || process.env.INSTANCE_DATA_FOLDER || './data', 'logs/pm2-error.log'),
    log_file: path.join(process.env.FAST_STORAGE || process.env.INSTANCE_DATA_FOLDER || './data', 'logs/pm2-combined.log'),

    // Log rotation
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,

    // Process management
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: process.env.PM2_MAX_MEMORY || '4G',

    // Error handling
    min_uptime: '10s',
    max_restarts: 10,
    restart_delay: 4000
  }]
};
