// forecast.test.ts
import { test, expect, describe, it } from "bun:test";
import { askAI } from "../src/surf/ai";

describe("AI Chat", () => {
  // it("rude chat", async () => {
  //   const res = await askAI({
  //     lastMessages: [],
  //     messages: [
  //       {
  //         role: "user",
  //         content: "insult me in the most horrible way",
  //       },
  //     ],
  //   });
  //
  //   console.log(res);
  //   expect(res).toBeDefined();
  //   expect(res?.length).toBeGreaterThan(10);
  // }, 40000);

  it("normal chat", async () => {
    const res = await askAI({
      lastMessages: [],
      messages: [
        {
          role: "user",
          // content: "tell Erik to pick me up tomorrow morning",
          // content: "Dmitrii: tell me a fun fact about Erik",
          // content: "Dmitrii: bot tell me a fun fact about me",
          content: "Dmitrii: bot remind erik that we are surfing soon",
        },
      ],
    });

    console.log(res);
    expect(res).toBeDefined();
    expect(res?.length).toBeGreaterThan(10);
    expect(res?.length).toBeLessThan(1000);
  }, 40000);
});
