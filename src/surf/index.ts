import { Bot, Context } from "grammy";
import { hydrateReply, type ParseModeFlavor } from "@grammyjs/parse-mode";

import { fetchWindSpeedAsKnots, renderWindsAsTable } from "./wind.ts";
import fetchTideFromSurfLineAPI, { renderTidesAsTable } from "./tide.ts";
import * as Sentry from "@sentry/bun";

Sentry.init({
  dsn: process.env.SURF_SENTRY,
  tracesSampleRate: 1.0,
});

const bot = new Bot<ParseModeFlavor<Context>>(process.env.SURF_API_KEY!);
bot.use(hydrateReply);

await bot.api.setMyCommands([
  { command: "start", description: "Start the bot" },
  {
    command: "surf",
    description: "Get wind and tide info from Surfline and Holfuy",
  },
]);

bot.command("start", (ctx) => {
  return ctx.reply("Hello. I am a tide and wind bot for Siargao surf");
});

bot.command("surf", (ctx) => {
  return Promise.all([
    fetchWindSpeedAsKnots().then((winds) =>
      ctx.replyWithMarkdownV2(
        `*Current wind:*${"```" + renderWindsAsTable(winds) + "```"}`,
      ),
    ),
    fetchTideFromSurfLineAPI().then((tides) =>
      ctx.replyWithMarkdownV2(
        `*Tide forecast:*${"```" + renderTidesAsTable(tides.slice(0, 10)) + "```"}`,
      ),
    ),
  ]);
});

bot.start().catch((e) => {
  Sentry.captureException(e);
});
