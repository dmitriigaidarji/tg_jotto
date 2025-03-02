import OpenAI from "openai";
import { InputFile } from "grammy";
import surfRedisClient from "./redis.ts";
import {
  additionalSummary,
  type AIMessage,
  initialSystemPrompt,
} from "./constants.ts";

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

const summaryFilePath = "compiled/summary.txt";
export async function learnedSummary(): Promise<AIMessage> {
  const file = Bun.file(summaryFilePath);
  if (await file.exists()) {
    const text = await file.text();
    return {
      role: "system",
      content: `This is additional summary about every person: ${text}`,
    };
  } else {
    return {
      role: "system",
      content: additionalSummary,
    };
  }
}
function convertUserMessage(messages: string[]): AIMessage {
  return {
    role: "system",
    content:
      `This is the latest conversation history,
      rely on it while making your replies. 
      Try not to repeat yourself.
      The messages start with author of the message who is one of the three guys mentioned above 
      and follows with the message text.
      Some of those messages are your own, those start with 'Assistant' keyword, but don't start your replies with that keyword or with any other keyword.
      Here is the list of all the recent messages: ` + messages.join("\n"),
  };
}
export async function askAIRaw({ messages }: { messages: AIMessage[] }) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
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
    .concat([await learnedSummary(), convertUserMessage(lastMessages)])
    .concat(messages);
  console.log({ allMessages });
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: allMessages,
    max_completion_tokens: 2048,
    frequency_penalty: 1,
    response_format: {
      type: "text",
    },
  });
  return response.choices[0]?.message.content;
}

async function askSummary({ lastMessages }: { lastMessages: string[] }) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: initialChatMessages
      .concat([await learnedSummary(), convertUserMessage(lastMessages)])
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
  return response.choices[0]?.message.content;
}

export async function askSummaryAndSaveToFile({
  lastMessages,
}: {
  lastMessages: string[];
}) {
  const summary = await askSummary({ lastMessages });
  if (summary) {
    return Bun.write(summaryFilePath, summary);
  }
}

export async function askRandomQuestion({
  lastMessages,
}: {
  lastMessages: string[];
}) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: initialChatMessages
      .concat([await learnedSummary(), convertUserMessage(lastMessages)])
      .concat([
        {
          role: "system",
          content:
            "Ask either Vlad or Erik a random question. Try to be provocative to trigger an immediate response",
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
