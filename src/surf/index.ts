import { Bot, type CommandContext, Context, InlineKeyboard } from "grammy";
import { hydrateReply, type ParseModeFlavor } from "@grammyjs/parse-mode";

import { fetchWindSpeedAsKnots } from "./wind.ts";
import fetchTideFromSurfLineAPI, { filterTides, formatDate } from "./tide.ts";
import * as Sentry from "@sentry/bun";
import { askAI } from "./ai.ts";

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
]);

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

const lastMessages: string[] = [];

bot.on("message:text", async (ctx) => {
  const text = ctx.message.text.trim();
  const message = `${ctx.from.first_name}: ${text}`;
  lastMessages.push(message);
  while (lastMessages.length > 40) {
    lastMessages.shift();
  }
  const lowerText = text.toLowerCase();

  if (["bot"].some((t) => lowerText.includes(t))) {
    const response = await askAI({
      messages: [
        {
          role: "user",
          content: message,
        },
      ],
      lastMessages,
    });
    if (response) {
      lastMessages.push(`Assistant: ${response}`);
      return ctx.reply(response, {
        reply_parameters: { message_id: ctx.msg.message_id },
      });
    }
  }
});

bot.start().catch((e) => {
  Sentry.captureException(e);
});
