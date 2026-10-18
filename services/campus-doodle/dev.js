'use strict';

const fs = require('fs');
const path = require('path');

const envFile = path.join(__dirname, '..', '..', '.env.local');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?(CAMPUS_DOODLE_AUTH_SECRET|SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_SUPABASE_URL)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const key = match[1] === 'NEXT_PUBLIC_SUPABASE_URL' ? 'SUPABASE_URL' : match[1];
    if (process.env[key]) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[key] = value;
  }
}

process.env.PORT = process.env.PORT || '3101';
process.env.ALLOWED_ORIGINS = [...new Set([
  'http://localhost:3000',
  'http://localhost:3002',
  'http://localhost:3037',
  ...(process.env.ALLOWED_ORIGINS || '').split(',').map(origin => origin.trim()).filter(Boolean)
])].join(',');

const { start } = require('./server');

start().then(server => {
  console.log(`Campus Doodle running on http://localhost:${server.address().port}`);
}).catch(error => {
  console.error('Could not start Campus Doodle.', error);
  process.exitCode = 1;
});
