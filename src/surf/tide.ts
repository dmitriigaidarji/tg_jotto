import surfRedisClient from "./redis.ts";
import { table } from "table";
import { format } from "date-fns";

interface ITide {
  date: Date;
  utcOffset: number;
  type: "NORMAL" | "HIGH" | "LOW";
  timestamp: number;
  height: number;
}
async function fetchTideFromSurfLineAPI(): Promise<ITide[]> {
  const cacheKey = "siargao-tides";
  const cached = await surfRedisClient.get(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as any[];
      return parsed.map((t) => ({
        ...t,
        date: new Date(t.date),
      })) as ITide[];
    } catch (e) {}
  }
  return fetch(
    "https://services.surfline.com/kbyg/spots/forecasts/tides?spotId=5842041f4e65fad6a7708d7a",
    {
      headers: {
        accept: "*/*",
        "accept-language": "en-US,en;q=0.9,ru-RU;q=0.8,ru;q=0.7",
        "cache-control": "no-cache",
        pragma: "no-cache",
        priority: "u=1, i",
        "sec-ch-ua":
          '"Not)A;Brand";v="99", "Google Chrome";v="127", "Chromium";v="127"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"macOS"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-site",
      },
      referrer: "https://www.surfline.com/",
      referrerPolicy: "strict-origin-when-cross-origin",
      body: null,
      method: "GET",
      mode: "cors",
      credentials: "omit",
    },
  )
    .then((r) => r.json())
    .then(
      (r: {
        data: {
          tides: {
            timestamp: number;
            utcOffset: number;
            type: "NORMAL" | "HIGH" | "LOW";
            height: number;
          }[];
        };
      }) => {
        const { tides } = r.data;
        return tides
          .filter((t, i) => t.type !== "NORMAL")
          .map((t) => ({
            ...t,
            date: new Date(t.timestamp * 1000),
          }));
      },
    )
    .then(async (data) => {
      await surfRedisClient
        .set(cacheKey, JSON.stringify(data))
        .then(() => surfRedisClient.expire(cacheKey, 3600));
      return data;
    });
}

function formatDate(date: Date, utcOffsetHrs: number) {
  const baseTzOffset = utcOffsetHrs * 60;
  const tzOffset = date.getTimezoneOffset();
  const d = new Date(date.valueOf() + (baseTzOffset + tzOffset) * 60 * 1000);
  return format(d, "d MMM yyyy h:mm aa");
}

export function renderTidesAsTable(data: ITide[]): string {
  const r = data.map((t) => [formatDate(t.date, 8), t.type, t.height]);
  r.unshift(["Local Time", "Peak", "Height"]);
  return table(r);
}

export default fetchTideFromSurfLineAPI;
