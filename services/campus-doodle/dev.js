'use strict';

process.env.PORT = process.env.PORT || '3101';

const { start } = require('./server');

start().then(server => {
  console.log(`Campus Doodle running on http://localhost:${server.address().port}`);
}).catch(error => {
  console.error('Could not start Campus Doodle.', error);
  process.exitCode = 1;
});
