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
import { validateEnglishWord } from "./dict.ts";
import { getCurrentPlayers, getCurrentScores } from "./helpers.ts";
import { hydrateReply, parseMode } from "@grammyjs/parse-mode";
import type { ParseModeFlavor } from "@grammyjs/parse-mode";

interface IGameUser {
  username: string;
  wordToGuess: string;
}
export interface SessionData {
  mode: "idle" | "progress";
  users: IGameUser[];
  num_letters: number;
  validateEnglish: boolean;
  scores: {
    [username: string]: number;
  };
}

type MyContext = Context & SessionFlavor<SessionData> & ConversationFlavor;
type MyConversation = Conversation<MyContext>;

// Create a bot object
const bot = new Bot<ParseModeFlavor<MyContext>>(process.env.API_KEY!); // <-- place your bot token in this string
bot.use(hydrateReply);

// Install session middleware, and define the initial session value.
function initial(): SessionData {
  return {
    mode: "idle",
    users: [],
    num_letters: 5,
    validateEnglish: false,
    scores: {},
  };
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
  { command: "start", description: "Start the game" },
  { command: "stop", description: "Stop the game" },
  { command: "word", description: "Set the word for your game session" },
]);

function getUserIdentifier(
  props:
    | {
        username?: string;
        id: number;
      }
    | undefined,
): string | undefined {
  if (props) {
    const { username, id } = props;
    return username ?? id + "";
  }
  return undefined;
}

/** Defines the conversation */
async function setWordConvo(conversation: MyConversation, ctx: MyContext) {
  const username = getUserIdentifier(ctx.update.message?.from);
  if (!username) {
    return ctx.reply("Username not found");
  }
  const currentWord = await conversation.external(() =>
    getPlayerWord(username),
  );
  await ctx.reply(
    `Hi there!${currentWord ? ` Your current word is: ${currentWord}.` : ""} What is your new word?`,
  );
  let gotWord = false;
  while (!gotWord) {
    const { message } = await conversation.wait();
    const word = message?.text?.toLowerCase();
    if (word) {
      if (!word) {
        ctx.reply("Word cannot be empty");
      } else if (new Set(word.split("")).size !== word.length) {
        ctx.reply("All letters should be unique");
      } else {
        await setPlayerWord({
          username,
          word,
        });
        gotWord = true;

        return ctx.reply(
          `Your word now is: ${word}. Go to the group chat and play!`,
        );
      }
    }
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

bot.command("stop", (ctx) => {
  ctx.session.mode = "idle";
  ctx.session.users.length = 0;
  const { chat } = ctx;

  if (chat.type === "group") {
    return ctx.reply("The game was cancelled.");
  } else {
    return ctx.reply(
      "Use this command in a group chat to stop an ongoing game.",
    );
  }
});

bot.command("start", (ctx) => {
  const { chat } = ctx;
  if (chat.type === "group") {
    return ctx.reply(
      `New Game. Number of letters: ${
        ctx.session.num_letters
      }. ${getCurrentPlayers(ctx.session)} ${getCurrentScores(ctx.session)}`,
      {
        reply_markup: new InlineKeyboard()
          .url(
            "Set word in a private chat",
            `https://t.me/JottoGameBot?start=word`,
          )
          .row()
          .text("Toggle English dictionary validation", "toggle-validate")
          .row()
          .text("Change number of letters", "change-letters")
          .row()
          .text("Join the game", "join")
          .row()
          .text("Start the game", "start-game"),
      },
    );
  } else {
    return ctx.conversation.enter("setWordConvo");
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

bot.callbackQuery("toggle-validate", async (ctx) => {
  ctx.session.validateEnglish = !ctx.session.validateEnglish;
  return ctx.reply(
    `English dictionary validation has been ${ctx.session.validateEnglish ? "enabled" : "disabled"}!`,
  );
});

bot.callbackQuery("change-letters", async (ctx) => {
  if (ctx.session.mode === "progress") {
    return ctx.reply(
      "Cannot change number of letters while the game is in progress.",
    );
  }
  const keyboard = new InlineKeyboard();
  for (let i = 4; i < 9; i++) {
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
          const wordToGuess = await getPlayerWord(nextUser.username);
          if (wordToGuess) {
            current.wordToGuess = wordToGuess;
          } else {
            ctx.session.mode = "idle";
            ctx.session.users.length = 0;
            return ctx.reply("Failed to start the game. Try again.");
          }
        } else {
          ctx.session.mode = "idle";
          ctx.session.users.length = 0;
          return ctx.reply("Failed to start the game. Try again.");
        }
      }
    }
    ctx.reply("Starting the game! Type your guesses");
    await ctx.answerCallbackQuery({
      text: "Starting the game..",
    });
  } else {
    return ctx.answerCallbackQuery({
      text: `Not enough players have joined. ${getCurrentPlayers(ctx.session)}`,
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
      if (ctx.session.validateEnglish && !(await validateEnglishWord(word))) {
        return ctx.reply(
          `${username} tried to join the game, but their word was not a valid English word. Press Toggle English dictionary validation button to disable this verification step.`,
        );
      }
      const user = ctx.session.users.find((t) => t.username === username);
      if (!user) {
        ctx.session.users.push({
          username: username!,
          wordToGuess: "",
        });
      }
      ctx.reply(
        `${username}  joined the game! ${getCurrentPlayers(ctx.session)}`,
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
bot.on("message:text", async (ctx) => {
  if (ctx.session.mode === "progress") {
    const username = getUserIdentifier(ctx.from);
    if (username) {
      const guess = ctx.message.text.toLowerCase().trim();
      if (guess.length === ctx.session.num_letters) {
        if (new Set(guess.split("")).size !== guess.length) {
          return ctx.reply("All letters should be unique", {
            reply_parameters: { message_id: ctx.msg.message_id },
          });
        }
        if (
          ctx.session.validateEnglish &&
          !(await validateEnglishWord(guess))
        ) {
          return ctx.reply(
            `${guess} is not a valid English word. Press Toggle English dictionary validation button to disable this verification step.`,
            {
              reply_parameters: { message_id: ctx.msg.message_id },
            },
          );
        }
        const user = ctx.session.users.find((t) => t.username === username);
        if (user) {
          const word = user.wordToGuess;
          if (guess === word) {
            const { session } = ctx;
            const { scores } = session;
            if (scores[username] == undefined) {
              scores[username] = 1;
            } else {
              scores[username]++;
            }
            const scoresResult = getCurrentScores(session);
            session.mode = "idle";
            session.users.length = 0;

            return ctx.reply(
              `${username} has guessed the word correctly! ${scoresResult}`,
              {
                reply_parameters: { message_id: ctx.msg.message_id },
              },
            );
          } else {
            const matched = guess.split("").filter((l) => word.includes(l));
            const score = matched.length;
            const fmt = matched.map((char, i) =>
              word[i] === char ? `<u><b>${char}</b></u>` : char,
            );
            return ctx.replyWithHTML(
              `Score <b>${score}</b>. Matched: ${fmt.join("")}`,
              {
                reply_parameters: { message_id: ctx.msg.message_id },
              },
            );
          }
        }
      }
    }
  }
});

// Start the bot (using long polling)
bot.start();

// Bun.serve({
//   fetch(req) {
//     return new Response("Bun!");
//   },
//   port: process.env.PORT || 3001,
// });
