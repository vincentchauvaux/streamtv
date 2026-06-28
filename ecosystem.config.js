// Configuration PM2 pour StreamTV — voir DEPLOIEMENT.md (étape 7).
// Lancement : pm2 start ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "streamtv",
      script: "node_modules/next/dist/bin/next",
      args: "start",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "2G",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
    },
  ],
};
