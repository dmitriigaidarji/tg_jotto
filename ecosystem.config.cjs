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
      repo: "https://github.com/dmitriigaidarji/tg_jotto.git",
      path: "/root/projects/tg_jotto",
      "pre-deploy-local": "",
      "post-deploy":
        "bun i && pm2 reload ecosystem.config.cjs --env production",
      "pre-setup": "",
    },
  },
};
