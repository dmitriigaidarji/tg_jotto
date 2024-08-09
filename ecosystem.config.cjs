module.exports = {
  apps: [
    {
      name: "tg-jotto", // Name of your application
      script: "src/index.ts", // Entry point of your application
      interpreter: "~/.bun/bin/bun", // Path to the Bun interpreter
    },
  ],
  deploy: {
    production: {
      user: "root",
      host: "188.245.103.173",
      ref: "origin/main",
      repo: "git@github.com:dmitriigaidarji/tg_jotto.git",
      path: "~/projects/tg_jotto",
      "pre-deploy-local": "",
      "post-deploy":
        "npm install && pm2 reload ecosystem.config.js --env production",
      "pre-setup": "",
    },
  },
};
