import { Bot, type CommandContext, Context, InlineKeyboard } from "grammy";
import { hydrateReply, type ParseModeFlavor } from "@grammyjs/parse-mode";

import { fetchWindSpeedAsKnots } from "./wind.ts";
import fetchTideFromSurfLineAPI, { filterTides, formatDate } from "./tide.ts";
import * as Sentry from "@sentry/bun";
import {
  askAI,
  askAIRaw,
  askRandomQuestion,
  askSummaryAndSaveToFile,
  userSystemSettingsKey,
} from "./ai.ts";
import surfRedisClient from "./redis.ts";
import { addHours, differenceInHours, subDays } from "date-fns";
import { getSurfLineForecast } from "./surfline.ts";
import { generateImage } from "./draw.ts";

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

const doSummaryEveryNLines = 100;
let summaryLineCounter = 0;
let lastMessageDate = subDays(new Date(), 1);
let isBotMessageLast = false;
const lastMessagesKey = "last_messages";
const lastForecastKey = "forecast";

const chatId = -4198414171;

async function getLatestMessages(): Promise<string[]> {
  const cached = await surfRedisClient.get(lastMessagesKey);
  let lastMessages: string[] = [];
  if (cached) {
    try {
      lastMessages = JSON.parse(cached);
    } catch (err) {}
  }
  return lastMessages;
}

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
  console.log("chat id", (await ctx.getChat()).id, "; message", message);

  const lastMessages = await getLatestMessages();

  let assistantMessage: string | undefined;
  const lowerText = text.toLowerCase();
  if (lowerText.startsWith("system.")) {
    const trimmed = text.substring(7).trim();
    await surfRedisClient.set(userSystemSettingsKey, trimmed);
    return ctx.reply("Added to system prompt", {
      reply_parameters: { message_id: ctx.msg.message_id },
    });
  } else if (lowerText.startsWith("draw.")) {
    const trimmed = text.substring(5).trim();
    const prompt = await askAI({
      lastMessages,
      messages: [
        {
          role: "system",
          content:
            "Only reply with the prompt itself. Create a prompt for Dalle for this query: " +
            trimmed,
        },
      ],
    });
    console.log("PROMPT: " + prompt);
    if (prompt) {
      const imageUrl = await generateImage(prompt);
      if (imageUrl) {
        return ctx.replyWithPhoto(imageUrl, {
          reply_parameters: { message_id: ctx.msg.message_id },
        });
      }
    }
    return;
  } else if (lowerText.startsWith("picture.")) {
    const trimmed = text.substring(8).trim();
    const imageUrl = await generateImage(trimmed);
    if (imageUrl) {
      return ctx.replyWithPhoto(imageUrl, {
        reply_parameters: { message_id: ctx.msg.message_id },
      });
    }
    return;
  } else if (lowerText.includes("bot")) {
    const response = await askAI({
      messages: [
        {
          role: "user",
          content: message,
        },
      ],
      lastMessages,
    });
    console.log("ai response", response);
    if (response) {
      lastMessageDate = new Date();
      isBotMessageLast = true;
      // asking forecast
      if (
        response.length < 10 &&
        response.toUpperCase().startsWith("FORECAST")
      ) {
        let forecast = await surfRedisClient.get(lastForecastKey);
        if (!forecast) {
          forecast = (await getSurfLineForecast()) ?? null;
          if (forecast) {
            await surfRedisClient.set(lastForecastKey, forecast);
            await surfRedisClient.expire(lastForecastKey, 60 * 60 * 12); // 12h
          }
        }
        if (forecast) {
          const forecastResponse = await askAIRaw({
            messages: [
              {
                role: "system",
                content: `Do a surf forecast based on the data below. Include rating from the data. Additional request details from the user: "${text}". Data:\n${forecast}`,
              },
            ],
          });
          if (forecastResponse) {
            ctx.reply(forecastResponse, {
              reply_parameters: { message_id: ctx.msg.message_id },
            });
          }
        }
      } else {
        assistantMessage = `Assistant: ${response}`;
        ctx.reply(response, {
          reply_parameters: { message_id: ctx.msg.message_id },
        });
        // const audio = await textToSpeech(response);
        // ctx.replyWithAudio(audio, {
        //   reply_parameters: { message_id: ctx.msg.message_id },
        // });
      }
    } else {
      isBotMessageLast = false;
    }
  } else {
    isBotMessageLast = false;
  }

  // max N messages
  lastMessages.push(message);
  if (assistantMessage) {
    lastMessages.push(assistantMessage);
  }
  while (lastMessages.length > doSummaryEveryNLines) {
    lastMessages.shift();
  }

  if (++summaryLineCounter >= doSummaryEveryNLines) {
    summaryLineCounter = 0;
    askSummaryAndSaveToFile({ lastMessages });
  }
  await surfRedisClient.set(lastMessagesKey, JSON.stringify(lastMessages));
});

async function randomAIMessages() {
  if (differenceInHours(new Date(), lastMessageDate) > 3) {
    lastMessageDate = new Date();
    isBotMessageLast = true;
    const lastMessages = await getLatestMessages();
    const q = await askRandomQuestion({ lastMessages });
    if (q) {
      lastMessages.push(`Assistant: ${q}`);
      // const audio = await textToSpeech(q);
      // bot.api.sendAudio(chatId, audio);
      return bot.api.sendMessage(chatId, q);
    }
  }
}
setInterval(randomAIMessages, 1000 * 60 * 60);

bot.start().catch((e) => {
  Sentry.captureException(e);
  throw e;
});

randomAIMessages();
