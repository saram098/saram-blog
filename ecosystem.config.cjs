module.exports = {
  apps: [{
    name: 'saram-blog',
    script: 'scripts/serve.mjs',
    cwd: __dirname,
    env: { NODE_ENV: 'production', PORT: 4321 },
    instances: 1,
    autorestart: true,
    max_memory_restart: '200M',
  }],
};
