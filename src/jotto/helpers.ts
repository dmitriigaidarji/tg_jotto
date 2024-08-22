import type { SessionData } from "./index.ts";
import { cloneDeep } from "lodash-es";

export function formatScores(
  data: Pick<SessionData, "scores" | "users">,
): string {
  const scores = cloneDeep(data.scores);
  data.users.forEach((user) => {
    if (!scores[user.username]) {
      scores[user.username] = 0;
    }
  });
  return Object.entries(scores)
    .sort(([_, v1], [_2, v2]) => (v1 > v2 ? -1 : 1))
    .map(([key, value]) => {
      return `${key}: ${value}`;
    })
    .join(", ");
}

export function getCurrentPlayers({
  users,
}: Pick<SessionData, "users">): string {
  if (users.length === 0) {
    return "";
  }
  return `Current players: ${users.map((t) => t.username).join(", ")}.`;
}

export function getCurrentScores(
  props: Pick<SessionData, "scores" | "users">,
): string {
  const scoresStr = formatScores(props);
  if (!scoresStr) {
    return "";
  }
  return `Current scores: ${scoresStr}.`;
}

export function getUserIdentifier(
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
