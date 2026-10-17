'use strict';

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
