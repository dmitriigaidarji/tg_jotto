import { Bot, Context, session, type SessionFlavor } from "grammy";
import { hydrateReply, type ParseModeFlavor } from "@grammyjs/parse-mode";
import {
  type Conversation,
  type ConversationFlavor,
  conversations,
} from "@grammyjs/conversations";

interface SessionData {
  mode: "idle" | "progress";
}

type MyContext = Context & SessionFlavor<SessionData> & ConversationFlavor;
type MyConversation = Conversation<MyContext>;
function initial(): SessionData {
  return {
    mode: "idle",
  };
}
const bot = new Bot<ParseModeFlavor<MyContext>>(process.env.SURF_API_KEY!);
bot.use(hydrateReply);
bot.use(
  session({
    initial,
  }),
);

bot.use(conversations());

await bot.api.setMyCommands([
  { command: "wind", description: "Get wind info from Holfuy" },
  { command: "tide", description: "Get tide info from Surfline" },
]);

bot.start();
