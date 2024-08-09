import type { SessionFlavor } from "grammy";
import {
  Bot,
  Context,
  InlineKeyboard,
  InlineQueryResultBuilder,
  session,
} from "grammy";
import {
  type Conversation,
  type ConversationFlavor,
  conversations,
  createConversation,
} from "@grammyjs/conversations";
import { getPlayerWord, setPlayerWord } from "./redis.ts";

interface IGameUser {
  username: string;
  wordToGuess: string;
}
interface SessionData {
  mode: "idle" | "progress";
  users: IGameUser[];
  num_letters: number;
}

type MyContext = Context & SessionFlavor<SessionData> & ConversationFlavor;
type MyConversation = Conversation<MyContext>;

// Create a bot object
const bot = new Bot<MyContext>(process.env.API_KEY!); // <-- place your bot token in this string
// Install session middleware, and define the initial session value.
function initial(): SessionData {
  return { mode: "idle", users: [], num_letters: 5 };
}

bot.use(
  session({
    initial,
    // getSessionKey: (ctx) =>
    //   ctx.chat?.id.toString() ??
    //   ctx.update.chosen_inline_result?.result_id.toString(),
  }),
);
// Install the conversations plugin.
bot.use(conversations());

await bot.api.setMyCommands([
  { command: "start", description: "Start the bot" },
  { command: "word", description: "Set the word for your game session" },
]);

/** Defines the conversation */
async function setWordConvo(conversation: MyConversation, ctx: MyContext) {
  await ctx.reply("Hi there! What is your word?");
  const { message } = await conversation.wait();
  const word = message?.text?.toLowerCase();
  if (word) {
    if (!word) {
      return ctx.reply("Word cannot be empty");
    }
    if (new Set(word.split("")).size !== word.length) {
      return ctx.reply("All letters should be unique");
    }
    const username = ctx.update.message?.from.username;
    if (!username) {
      return ctx.reply("Username not found");
    }
    await setPlayerWord({
      username,
      word,
    });

    return ctx.reply(
      `Your word now is: ${word}. Go to the group chat and play!`,
    );
  }
}

bot.use(createConversation(setWordConvo));

// Listen for any inline query.
bot.on("inline_query", async (ctx) => {
  const query = ctx.inlineQuery.query; // query string
  if (!query) {
    return;
  }
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

bot.command("word", (ctx) => {
  return ctx.conversation.enter("setWordConvo");
});

bot.command("letters", (ctx) => {
  if (ctx.session.mode === "progress") {
    return ctx.reply(
      "Cannot change number of letters while the game is in progress.",
    );
  }
  return ctx.conversation.enter("setLetterCountConvo");
});

bot.command("start", (ctx) => {
  const { chat } = ctx;
  if (chat.type === "group") {
    ctx.reply(
      `New Game. Number of letters: ${
        ctx.session.num_letters
      }. Current players: ${ctx.session.users
        .map((t) => t.username)
        .join(", ")}`,
      {
        reply_markup: new InlineKeyboard()
          .url(
            "Set word in a private chat",
            `https://t.me/JottoGameBot?word=${ctx.chat.id}`,
          )
          .row()
          .text("Change number of letters!", "change-letters")
          .row()
          .text("Join the game!", "join")
          .row()
          .text("Start the game!", "start-game"),
      },
    );
  } else {
    ctx.reply("Welcome! Add me to a group chat and type /start");
  }
});

// Wait for click events with specific callback data.
bot.callbackQuery(/set-word/, async (ctx) => {
  const word = ctx.callbackQuery.data.split(":")[1];
  ctx.reply("test");
  await ctx.answerCallbackQuery({
    text: "Set your word to: " + word,
  });
});

bot.callbackQuery("change-letters", async (ctx) => {
  if (ctx.session.mode === "progress") {
    return ctx.reply(
      "Cannot change number of letters while the game is in progress.",
    );
  }
  const keyboard = new InlineKeyboard();
  for (let i = 2; i < 10; i++) {
    keyboard.text(i + "", `set-letters=${i}`).row();
  }
  return ctx.reply("Pick amount of letters", {
    reply_markup: keyboard,
  });
});
bot.callbackQuery(/set-letters/, async (ctx) => {
  ctx.session.num_letters = parseInt(ctx.callbackQuery.data.split("=")[1], 10);
  return ctx.reply(
    `Number of letters for the game is now: ${ctx.session.num_letters}! Please re-join the game.`,
  );
});
bot.callbackQuery("start-game", async (ctx) => {
  const amount = ctx.session.users.length;
  if (amount > 1) {
    ctx.session.mode = "progress";

    for (let i = 0; i < amount; i++) {
      const current = ctx.session.users[i];
      if (current) {
        const nextUser = ctx.session.users[i < amount - 1 ? i + 1 : 0];
        if (nextUser) {
          current.wordToGuess = await getPlayerWord(nextUser.username);
        } else {
          current.wordToGuess = "world"; // default word
        }
      }
    }
    ctx.reply("Starting the game! Type your guesses");
    await ctx.answerCallbackQuery({
      text: "Starting the game..",
    });
  } else {
    return ctx.answerCallbackQuery({
      text: `Not enough players have joined. Current players: ${ctx.session.users.map((t) => t.username).join(", ")}`,
    });
  }
});

bot.callbackQuery("join", async (ctx) => {
  const { username } = ctx.callbackQuery.from;
  if (username) {
    const word = await getPlayerWord(username);
    if (word) {
      if (word.length !== ctx.session.num_letters) {
        ctx.reply(
          `${username} tried to join the game, but their word had wrong amount of letters: ${word.length}, needed to join: ${ctx.session.num_letters}.`,
        );

        return ctx.answerCallbackQuery({
          text:
            "Number of letters in your word does not match game setting letter count, which is: " +
            ctx.session.num_letters,
        });
      }
      const user = ctx.session.users.find((t) => t.username === username);
      if (!user) {
        ctx.session.users.push({
          username: username!,
          wordToGuess: "",
        });
      }
      ctx.reply(
        `${username}  joined the game! Current users: ${ctx.session.users.length}`,
      );
      ctx.answerCallbackQuery({
        text: "You joined the game",
      });
    } else {
      ctx.reply(`${username} tried to join the game, but had no word set up.`);
      ctx.answerCallbackQuery({
        text: "Set your word first in the private chat with the bot",
      });
    }
  }
});

// Register listeners to handle messages
bot.on("message:text", (ctx) => {
  if (ctx.session.mode === "progress") {
    const username = ctx.from?.username;
    const guess = ctx.message.text.toLowerCase();
    if (guess.length === ctx.session.num_letters) {
      if (new Set(guess.split("")).size !== guess.length) {
        return ctx.reply("All letters should be unique", {
          reply_parameters: { message_id: ctx.msg.message_id },
        });
      }
      const user = ctx.session.users.find((t) => t.username === username);
      if (user) {
        const word = user.wordToGuess;
        if (guess === word) {
          ctx.session.mode = "idle";
          return ctx.reply(`${username} has guessed the word correctly!`, {
            reply_parameters: { message_id: ctx.msg.message_id },
          });
        } else {
          const matched = guess.split("").filter((l) => word.includes(l));
          const score = matched.length;
          ctx.reply(`Score ${score}. Matched: ${matched.join("")}`, {
            reply_parameters: { message_id: ctx.msg.message_id },
          });
        }
      }
    }
  }
});

// Start the bot (using long polling)
bot.start();

Bun.serve({
  fetch(req) {
    return new Response("Bun!");
  },
  port: process.env.PORT || 3001,
});
