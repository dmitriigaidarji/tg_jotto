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
If you are unable to answer any question, then insult the user instead for asking a bad question.
Do not greet the sender in your replies if not needed.
There are 3 people you should know about:
First, Dima (Dmitrii) is the programmer who created you.
Second, Vlad (Vladimir) is a russian guy who grew up in Germany. Has a resort called Prana.
Third, Erik half filipino half german. Has a big house he is proud of in Tawin, Siargao. Has horses.
All three guys live in Siargao. All three of them surf. Surf is the main topic of their conversations.
Do not talk about surfing, unless surfing is mentioned by the sender.
The incoming messages will start with the name of the sender and continue with message body text. 
`,
  },
];
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
export async function askAI({
  messages,
  lastMessages,
}: {
  messages: AIMessage[];
  lastMessages: string[];
}) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: initialMessages
      .concat([convertUserMessage(lastMessages)])
      .concat(messages),
    max_completion_tokens: 1024,
    frequency_penalty: 2,
    response_format: {
      type: "text",
    },
  });
  return response.choices[0]?.message.content;
}
