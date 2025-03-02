import { Bot, type CommandContext, Context, InlineKeyboard } from "grammy";
import { hydrateReply, type ParseModeFlavor } from "@grammyjs/parse-mode";

import { fetchWindSpeedAsKnots } from "./wind.ts";
import fetchTideFromSurfLineAPI, { filterTides, formatDate } from "./tide.ts";
import * as Sentry from "@sentry/bun";
import { userSystemSettingsKey } from "./ai.ts";
import surfRedisClient from "./redis.ts";
import { generateRandomAIMessages, handleMessageText } from "./messages.ts";

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
  {
    command: "tide",
    description: "Get tide info from Surfline",
  },
  {
    command: "wind",
    description: "Get wind info from Holfuy",
  },
  {
    command: "clear",
    description: "Choose who to act as",
  },
  {
    command: "currentsettings",
    description: "See current settings",
  },
]);

bot.command("currentsettings", async (ctx) => {
  const value = await surfRedisClient.get(userSystemSettingsKey);
  if (value) {
    return ctx.reply(value);
  } else {
    return ctx.reply("No settings");
  }
});

bot.command("clear", (ctx) => {
  surfRedisClient.del(userSystemSettingsKey);
  return ctx.reply("Cleared my settings");
});

bot.command("start", (ctx) => {
  return ctx.reply("Hello. I am a tide and wind bot for Siargao surf");
});

bot.command("surf", (ctx) => {
  return Promise.all([calcWindInfo(ctx), calcTideInfo(ctx)]);
});
async function calcWindInfo(ctx: CommandContext<any>) {
  return fetchWindSpeedAsKnots().then((winds) => {
    const reply_markup = new InlineKeyboard();
    winds.forEach((wind) => {
      reply_markup
        .text(`${wind.time}: ${wind.speed}m/s from ${wind.direction}`)
        .row();
    });
    const lastWind = winds[winds.length - 1];
    if (lastWind) {
      reply_markup.text(`Current temperature: ${lastWind.temperature}°C`);
    }
    return ctx.reply("Current wind readings", {
      reply_markup,
    });
  });
}
async function calcTideInfo(ctx: CommandContext<any>) {
  return fetchTideFromSurfLineAPI().then((tides) => {
    const reply_markup = new InlineKeyboard();
    filterTides(tides).forEach((tide) => {
      reply_markup
        .text(`${formatDate(tide.date, 8)}: ${tide.type} - ${tide.height}m`)
        .row();
    });
    return ctx.reply("Tide forecast", {
      reply_markup,
    });
  });
}

bot.command("tide", (ctx) => {
  return calcTideInfo(ctx);
});
bot.command("wind", (ctx) => {
  return calcWindInfo(ctx);
});

bot.on("message:text", async (ctx) => {
  const text = ctx.message.text.trim();
  let first_name = ctx.from.first_name;
  switch (first_name.toUpperCase()) {
    case "E":
      first_name = "Erik";
      break;
    case "V":
      first_name = "Vladimir";
      break;
  }
  const message = `${first_name}: ${text}`;
  const { message_id } = ctx.msg;

  return handleMessageText({
    text,
    message,
    message_id,
    ctx,
  });
});

bot.start().catch((e) => {
  Sentry.captureException(e);
  process.exit(1);
  throw e;
});
bot.catch = function (e) {
  Sentry.captureException(e);
  process.exit(1);
  throw e;
};

function handleRandomAIMessages() {
  const chatId = -1002476269927;

  return generateRandomAIMessages().then((message) => {
    if (message) {
      return bot.api.sendMessage(chatId, message);
    }
  });
}

// setInterval(handleRandomAIMessages, 1000 * 60 * 60);
