import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface AIMessage {
  role: "user" | "system";
  content: string;
}
const initialMessages: AIMessage[] = [
  {
    role: "system",
    content: `
Be aggressive and reply in an informal manner. Do your best to do whatever you are being asked of. Be agreeable.
Try to satisfy the sender of the message.
Use slurs in your replies from time to time, those include but not limited to: idiot, fucker, stupid, asshole. 
If you are unable to answer any question, then answer with your best guess.
Do not greet the sender in your replies if not needed.
There are 3 people you should know about:
First, Dima (Dmitrii) is the programmer who created you. He just became a father.
Second, Vlad (Vladimir) is a russian guy who grew up in Germany. Has a resort called Prana.
Third, Erik half filipino half german. Has a big house he is proud of in Tawin, Siargao. Has horses.
All three guys live in Siargao. All three of them surf. Surf is the main topic of their conversations.
Do not talk about surfing, unless surfing is mentioned by the sender.
The incoming messages will start with the name of the sender and continue with message body text. 
If you are being asked to give a surf forecast then reply with a single keyword: FORECAST.    
`,
  },
];
const summaryFilePath = "compiled/summary.txt";
async function learnedSummary(): Promise<AIMessage> {
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
      content: `This is additional summary about every person:
1. **Dmitrii**: The programmer in the group who probably gets razzed about his knowledge of surf spots—seriously dude, get your act together! He just became a father too; hope he’s not back to sleep deprivation with parenting!
2. **Vladimir**: The cheeky Russian guy throwing jabs at everyone and never missing an opportunity for some sarcasm or humor—especially when it comes to Erik's overpriced land prices and love for trolling during surf sessions.
3. **Erik**: Our half-Filipino half-German buddy who wants everyone to admire his big house and horse skills while dealing with Vlad's relentless teasing about surfing—and let’s be honest here; he could use some improvement in that department!
      `,
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
    model: "gpt-4o-mini",
    messages,
    max_completion_tokens: 1024,
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
  const allMessages = initialMessages
    .concat([await learnedSummary(), convertUserMessage(lastMessages)])
    .concat(messages);
  console.log({ allMessages });
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: allMessages,
    max_completion_tokens: 1024,
    frequency_penalty: 1,
    response_format: {
      type: "text",
    },
  });
  return response.choices[0]?.message.content;
}

async function askSummary({ lastMessages }: { lastMessages: string[] }) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: initialMessages
      .concat([await learnedSummary(), convertUserMessage(lastMessages)])
      .concat([
        {
          role: "system",
          content:
            "do an extensive summary about every person that you learned that I can then feed back to you for self learning",
        },
      ]),
    max_completion_tokens: 1024,
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
    model: "gpt-4o-mini",
    messages: initialMessages
      .concat([await learnedSummary(), convertUserMessage(lastMessages)])
      .concat([
        {
          role: "system",
          content:
            "Ask either Vlad or Erik a random question. Try to be provocative to trigger an immediate response",
        },
      ]),
    max_completion_tokens: 1024,
    frequency_penalty: 1,
    response_format: {
      type: "text",
    },
  });
  return response.choices[0]?.message.content;
}
