import { createClient } from "redis";

const redisClient = await createClient()
  .on("error", (err) => console.log("Redis Client Error", err))
  .connect();

const PLAYER_WORD_SUFFIX = "-word";
function keyForWord(username: string) {
  return username + PLAYER_WORD_SUFFIX;
}
export function setPlayerWord({
  username,
  word,
}: {
  username: string;
  word: string;
}) {
  return redisClient.set(keyForWord(username), word);
}
export function getPlayerWord(username: string): Promise<string> {
  return redisClient.get(keyForWord(username)).then((r) => r ?? "word");
}

export default redisClient;
