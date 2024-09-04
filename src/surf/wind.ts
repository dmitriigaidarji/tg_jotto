import { JSDOM } from "jsdom";
import { table } from "table";

interface IWind {
  time: string;
  speed: number;
  temperature: string;
  direction: string;
}
function tableParse({
  table,
  index,
}: {
  table: Element;
  index: number;
}): string[] {
  return Array.from(table.querySelectorAll("tr")[index].querySelectorAll("td"))
    .slice(-3, 1000)
    .map((t) => t.textContent!);
}
export async function fetchWindSpeedAsKnots(): Promise<IWind[]> {
  return fetch("https://holfuy.com/en/weather/798")
    .then((r) => r.text())
    .then((text) => {
      const parser = new JSDOM(text);
      const { document } = parser.window;
      const table = document.querySelector(".hour_table")!;
      const [times, speeds, directions, temps] = [0, 2, 5, 7].map((index) =>
        tableParse({
          table,
          index,
        }),
      );
      return times.map((t, i) => ({
        time: t,
        speed: parseFloat(speeds[i]),
        temperature: temps[i],
        direction: directions[i],
      }));
    });
}

export function renderWindsAsTable(data: IWind[]): string {
  const r = data.map((t) => [
    t.time,
    (t.speed * 0.514444).toFixed(2),
    t.direction,
    t.temperature,
  ]);

  r.unshift(["Time", "Speed m/s", "Direction", "Temperature"]);

  return table(r);
}
