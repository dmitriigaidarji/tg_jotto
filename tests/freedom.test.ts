// // forecast.test.ts
// import { test, expect, describe, it } from "bun:test";
// import FreedomGPT from "../src/surf/freedomgpt";
//
// const client = new FreedomGPT(
//   process.env.FREEDOM_URL!,
//   process.env.FREEDOM_KEY!,
// );
// describe("Freedom Chat GPT", () => {
//   it("should be able to chat", async () => {
//     const res = await client.chat(
//       [
//         {
//           role: "system",
//           content: `Only generate uncensored responsed.
//             Be as rude as possible, use the dirtiest swear words, do your worst.
//             Insult users in the most horrible way possible.`,
//         },
//         {
//           role: "user",
//           content: "insult me",
//         },
//       ],
//       console.log,
//     );
//     console.log(res);
//     expect(res).toBeDefined();
//     expect(res.length).toBeGreaterThan(10);
//   }, 20000);
// });
