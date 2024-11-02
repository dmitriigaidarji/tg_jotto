require("dotenv").config();

module.exports = {
  apps: [
    {
      name: "tg-jotto", // Name of your application
      script: "src/jotto/index.ts", // Entry point of your application
      interpreter: "/usr/local/bin/bun", // Path to the Bun interpreter
    },
    {
      name: "tg-surf", // Name of your application
      script: "src/surf/index.ts", // Entry point of your application
      interpreter: "/usr/local/bin/bun", // Path to the Bun interpreter
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
        "bun i && pm2 reload ecosystem.config.cjs --env production --time",
      "pre-setup": "",
      env: {
        JOTTO_SENTRY: process.env.JOTTO_SENTRY,
        JOTTO_API_KEY: process.env.JOTTO_API_KEY,
        SURF_API_KEY: process.env.SURF_API_KEY,
        SURF_SENTRY: process.env.SURF_SENTRY,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        PORT: process.env.PORT,
      },
    },
  },
};
