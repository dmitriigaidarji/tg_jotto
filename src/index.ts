import {
  Bot,
  Context,
  InlineKeyboard,
  InlineQueryResultBuilder,
  session,
} from "grammy";
import type { SessionFlavor } from "grammy";

interface IGameUser {
  username: string;
  word: string;
}
interface SessionData {
  mode: "idle" | "progress";
  users: IGameUser[];
}

type MyContext = Context & SessionFlavor<SessionData>;

// Create a bot object
const bot = new Bot<MyContext>(process.env.API_KEY!); // <-- place your bot token in this string
// Install session middleware, and define the initial session value.
function initial(): SessionData {
  return { mode: "idle", users: [] };
}

bot.use(
  session({
    initial,
    // getSessionKey: (ctx) =>
    //   ctx.chat?.id.toString() ??
    //   ctx.update.chosen_inline_result?.result_id.toString(),
  }),
);

await bot.api.setMyCommands([
  { command: "start", description: "Start the bot" },
  { command: "help", description: "Show help text" },
  { command: "settings", description: "Open settings" },
  { command: "word", description: "Set the word for your game session" },
]);

// Listen for any inline query.
bot.on("inline_query", async (ctx) => {
  const query = ctx.inlineQuery.query; // query string
  if (!query) {
    return;
  }
  console.log("query:", query);
  const keyboard = new InlineKeyboard().text(
    "Activate this word",
    "set-word:" + query,
  ); //query);
  const result = InlineQueryResultBuilder.article(
    "id-1",
    "Confirm your word: " + query,
    {
      reply_markup: keyboard,
    },
  ).text("I added a word");

  await ctx.answerInlineQuery(
    [result], // answer with result list
  );
});
// bot.on("chosen_inline_result", (ctx) => {
//   const username = ctx.chosenInlineResult.from.username;
//   const word = ctx.chosenInlineResult.query; // used inline query
//   if (ctx.session) {
//     const user = ctx.session.users.find((t) => t.username === username);
//     if (user) {
//       user.word = word;
//     } else {
//       ctx.session.users.push({
//         username: username!,
//         word,
//       });
//     }
//   }
// });
bot.command("word", (ctx) => {
  const word = ctx.match;
  if (!word) {
    ctx.reply("Word cannot be empty");
  }
  const username = ctx.update.message?.from.username;
  if (!username) {
    ctx.reply("Username not found");
  }
  const user = ctx.session.users.find((t) => t.username === username);
  if (user) {
    user.word = word;
  } else {
    ctx.session.users.push({
      username: username!,
      word,
    });
  }
  ctx.reply(`Your word now is: ${word}`);
});

bot.command("start", (ctx) => {
  const { chat } = ctx;
  if (chat.type === "group") {
    console.log("word3", ctx.match);
    const button = {
      text: "Open private chat",
      start_parameter: "login",
    };
    const keyboard = new InlineKeyboard();
    //.text("Open private chat", "login")
    // ctx.reply("Start the Game", {
    //   reply_markup: new InlineKeyboard().text("Open private chat", "set-word"),
    // });
    // ctx.session.groupId = ctx.chat.id + "";
    ctx.reply(JSON.stringify(ctx.session));
    ctx.reply("Start the Game", {
      reply_markup: new InlineKeyboard().url(
        "Set word in a private chat",
        `https://t.me/JottoGameBot?word=${ctx.chat.id}`,
      ),
    });
  } else {
    console.log("word2", ctx.match);
    ctx.reply("Welcome! Add me to a group chat and type /start");
  }
});

// Wait for click events with specific callback data.
bot.callbackQuery(/set-word/, async (ctx) => {
  const word = ctx.callbackQuery.data.split(":")[1];
  await ctx.answerCallbackQuery({
    text: "Set your word to: " + word,
  });
});

// Register listeners to handle messages
// bot.on("message:text", (ctx) => {
//   ctx.reply("Echo: " + ctx.message.text);
// });

// Start the bot (using long polling)
bot.start();
