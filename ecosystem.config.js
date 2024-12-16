module.exports = {
    apps: [{
      name: 'batericars-api',
      script: './dist/index.js',
      instances: 'max',
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env_production: {
        NODE_ENV: 'production',
        ENV_FILE: '.env.production'
      }
    }]
  };