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

export async function processMessage({
  text,
  textWithAuthor,
}: {
  text: string;
  textWithAuthor: string;
}): Promise<{
  type: "text" | "image";
  value: string;
} | void> {
  const lastMessages = await getLatestMessages();
  const lowerText = text.toLowerCase();
  if (lowerText.startsWith("system.")) {
    const trimmed = text.substring(7).trim();
    await surfRedisClient.set(userSystemSettingsKey, trimmed);
    return {
      type: "text",
      value: "Added to system prompt",
    };
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
    if (prompt) {
      const imageUrl = await generateImage(prompt);
      if (imageUrl) {
        return {
          type: "image",
          value: imageUrl,
        };
      }
    }
    return;
  } else if (lowerText.startsWith("picture.")) {
    const trimmed = text.substring(8).trim();
    const imageUrl = await generateImage(trimmed);
    if (imageUrl) {
      return {
        type: "image",
        value: imageUrl,
      };
    }
    return;
  } else if (lowerText.includes("bot")) {
    const response = await askAI({
      messages: [
        {
          role: "user",
          content: textWithAuthor,
        },
      ],
      lastMessages,
    });
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
            return {
              type: "text",
              value: forecastResponse,
            };
          }
        }
      } else {
        return {
          type: "text",
          value: response,
        };
        // const audio = await textToSpeech(response);
        // ctx.replyWithAudio(audio, {
        //   reply_parameters: { message_id: ctx.msg.message_id },
        // });
      }
    }
  }
}

async function saveMessages({
  textWithAuthor,
  assistantMessage,
}: {
  textWithAuthor: string;
  assistantMessage?: string;
}) {
  const lastMessages = await getLatestMessages();

  // max N messages
  lastMessages.push(textWithAuthor);
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
export async function handleMessageText({
  text,
  textWithAuthor,
  ctx,
  message_id,
}: {
  text: string;
  textWithAuthor: string;
  ctx: Context;
  message_id: number;
}) {
  const result = await processMessage({
    text,
    textWithAuthor,
  });

  if (result) {
    saveMessages({
      textWithAuthor,
      assistantMessage: `Assistant: ${result.value}`,
    });
    switch (result.type) {
      case "image":
        return ctx.replyWithPhoto(result.value, {
          reply_parameters: { message_id },
        });
      case "text":
      default:
        return ctx.reply(result.value, {
          reply_parameters: { message_id },
        });
    }
  }
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
