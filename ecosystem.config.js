// PM2 process definitions. Run from the "current" release directory:
//   pm2 startOrReload ecosystem.config.js --update-env
const path = require('path');

module.exports = {
  apps: [
    {
      name: 'backend',
      cwd: path.join(__dirname, 'backend'),
      script: 'src/index.js',
      instances: 2,              // cluster mode -> zero-downtime reloads
      exec_mode: 'cluster',
      max_memory_restart: '300M',
      kill_timeout: 5000,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        APP_VERSION: process.env.APP_VERSION || '1.0.0',
        BUILD_NUMBER: process.env.BUILD_NUMBER || 'manual',
      },
    },
    {
      // PM2's built-in static file server for the built React app
      name: 'frontend',
      script: 'serve',
      env: {
        PM2_SERVE_PATH: path.join(__dirname, 'frontend', 'dist'),
        PM2_SERVE_PORT: 8080,
        PM2_SERVE_SPA: 'true',
        PM2_SERVE_HOMEPAGE: '/index.html',
      },
    },
  ],
};
