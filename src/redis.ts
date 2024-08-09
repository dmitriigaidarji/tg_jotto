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
  return redisClient
    .set(keyForWord(username), word)
    .then(() => redisClient.expire(keyForWord(username), 60 * 60)); // 1h
}
export function getPlayerWord(username: string) {
  return redisClient.get(keyForWord(username));
}

export default redisClient;
