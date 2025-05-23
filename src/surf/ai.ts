import OpenAI from "openai";
import { InputFile } from "grammy";
import surfRedisClient from "./redis.ts";
import { type AIMessage, initialSystemPrompt } from "./constants.ts";

export const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

const model = "thedrummer/skyfall-36b-v2"; // "cognitivecomputations/dolphin3.0-r1-mistral-24b:free"; //"mistralai/mistral-small-24b-instruct-2501:free"; // "thedrummer/skyfall-36b-v2";
const initialChatMessages: AIMessage[] = [
  {
    role: "system",
    content: initialSystemPrompt,
  },
];

export const userSystemSettingsKey = "userSystemSettings";
export async function userSystemSettings(): Promise<AIMessage[]> {
  const value = await surfRedisClient.get(userSystemSettingsKey);
  if (value) {
    return [
      {
        role: "system",
        content: "Important: " + value,
      },
    ];
  }
  return [];
}

function getSummaryFilePath(chatId: number) {
  return `compiled/summary-${chatId}.txt`;
}
export async function learnedSummary(chatId: number): Promise<AIMessage> {
  const file = Bun.file(getSummaryFilePath(chatId));
  if (await file.exists()) {
    const text = await file.text();
    return {
      role: "system",
      content: `This is additional summary about every person: ${text}`,
    };
  } else {
    return {
      role: "system",
      content: "",
    };
  }
}
function convertUserMessage(messages: string[]): AIMessage {
  if (messages.length === 0) {
    return {
      role: "system",
      content: ``,
    };
  }
  return {
    role: "system",
    content:
      `This is the latest conversation history,
      rely on it while making your replies. 
      Here is the list of all the recent messages: ` + messages.join("\n"),
  };
}
export async function askAIRaw({ messages }: { messages: AIMessage[] }) {
  const response = await openai.chat.completions.create({
    model,
    messages,
    max_completion_tokens: 2048,
    response_format: {
      type: "text",
    },
  });
  return response.choices[0]?.message.content;
}

export async function askAI({
  messages,
  lastMessages,
}: {
  messages: AIMessage[];
  lastMessages: string[];
}) {
  const userSystemM = await userSystemSettings();
  const initM = userSystemM.length > 0 ? userSystemM : initialChatMessages;
  const allMessages = initM
    .concat(await userSystemSettings())
    .concat([convertUserMessage(lastMessages)])
    .concat(messages);
  const response = await openai.chat.completions.create({
    model,
    messages: allMessages,
    max_completion_tokens: 1000,
    response_format: {
      type: "text",
    },
  });
  return response.choices[0]?.message.content;
}

async function askSummary({
  lastMessages,
  chatId,
}: {
  lastMessages: string[];
  chatId: number;
}) {
  const response = await openai.chat.completions.create({
    model,
    messages: initialChatMessages
      .concat([await learnedSummary(chatId), convertUserMessage(lastMessages)])
      .concat([
        {
          role: "system",
          content:
            "do an extensive summary about every person that you learned that I can then feed back to you for self learning",
        },
      ]),
    max_completion_tokens: 1024 * 10,
    frequency_penalty: 1,
    response_format: {
      type: "text",
    },
  });
  return response.choices[0]?.message.content?.substring(0, 4090);
}

export async function askSummaryAndSaveToFile({
  lastMessages,
  chatId,
}: {
  lastMessages: string[];
  chatId: number;
}) {
  const summary = await askSummary({ lastMessages, chatId });
  if (summary) {
    return Bun.write(getSummaryFilePath(chatId), summary);
  }
}

export async function askRandomQuestion({
  lastMessages,
  chatId,
}: {
  lastMessages: string[];
  chatId: number;
}) {
  const response = await openai.chat.completions.create({
    model,
    messages: initialChatMessages
      .concat([await learnedSummary(chatId), convertUserMessage(lastMessages)])
      .concat([
        {
          role: "system",
          content:
            "Ask any member of the chat a random question. Try to be provocative to trigger an immediate response",
        },
      ]),
    max_completion_tokens: 2048,
    response_format: {
      type: "text",
    },
  });
  return response.choices[0]?.message.content;
}

export async function textToSpeech(input: string) {
  const response = await openai.audio.speech.create({
    model: "tts-1",
    voice: "shimmer",
    input,
  });

  const buffer = Buffer.from(await response.arrayBuffer());
  // const filename = "/tmp/" + new Date().getTime() + ".mp3";
  // await Bun.write(filename, buffer);
  return new InputFile(buffer);
}
