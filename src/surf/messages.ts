import type { Context } from "grammy";
import surfRedisClient from "./redis.ts";
import {
  askAI,
  askAIRaw,
  askRandomQuestion,
  askSummaryAndSaveToFile,
  userSystemSettingsKey,
} from "./ai.ts";
import { generateImage } from "./draw.ts";
import { getSurfLineForecast } from "./surfline.ts";
import { differenceInHours, subDays } from "date-fns";

const lastMessagesKey = "last_messages";
const doSummaryEveryNLines = 100;
let summaryLineCounter = 0;
const lastForecastKey = "forecast";

export async function getLatestMessages(): Promise<string[]> {
  const cached = await surfRedisClient.get(lastMessagesKey);
  let lastMessages: string[] = [];
  if (cached) {
    try {
      lastMessages = JSON.parse(cached);
    } catch (err) {}
  }
  return lastMessages;
}

let lastMessageDate = subDays(new Date(), 1);

export async function handleMessageText({
  text,
  message,
  chatId,
  ctx,
  message_id,
}: {
  text: string;
  message: string;
  chatId: number;
  ctx: Context;
  message_id: number;
}) {
  console.log("chat id", chatId, "; message", message);

  const lastMessages = await getLatestMessages();

  let assistantMessage: string | undefined;
  const lowerText = text.toLowerCase();
  if (lowerText.startsWith("system.")) {
    const trimmed = text.substring(7).trim();
    await surfRedisClient.set(userSystemSettingsKey, trimmed);
    return ctx.reply("Added to system prompt", {
      reply_parameters: { message_id },
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
          reply_parameters: { message_id },
        });
      }
    }
    return;
  } else if (lowerText.startsWith("picture.")) {
    const trimmed = text.substring(8).trim();
    const imageUrl = await generateImage(trimmed);
    if (imageUrl) {
      return ctx.replyWithPhoto(imageUrl, {
        reply_parameters: { message_id },
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
              reply_parameters: { message_id },
            });
          }
        }
      } else {
        assistantMessage = `Assistant: ${response}`;
        ctx.reply(response, {
          reply_parameters: { message_id },
        });
        // const audio = await textToSpeech(response);
        // ctx.replyWithAudio(audio, {
        //   reply_parameters: { message_id: ctx.msg.message_id },
        // });
      }
    }
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
}
export async function generateRandomAIMessages() {
  if (differenceInHours(new Date(), lastMessageDate) > 3) {
    lastMessageDate = new Date();
    const lastMessages = await getLatestMessages();
    const q = await askRandomQuestion({ lastMessages });
    if (q) {
      lastMessages.push(`Assistant: ${q}`);
      await surfRedisClient.set(lastMessagesKey, JSON.stringify(lastMessages));
      // const audio = await textToSpeech(q);
      // bot.api.sendAudio(chatId, audio);
      return q;
    }
  }
}
