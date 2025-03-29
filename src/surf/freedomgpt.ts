type Message = {
  role: "user" | "assistant" | "system";
  content: string;
};

type ChatRequest = {
  messages: Message[];
  model: "aion-1.0-mini" | "aion-rp-llama-3.1-8b";
  max_tokens?: number;
  stream: boolean;
};

type ImageRequest = {
  prompt: string;
  model: "medusa";
  numberOfImages: number;
};
interface ChatResponse {
  choices: {
    index: string;
    messages: [
      {
        role: string;
        content: string;
      },
    ];
  };

  delay: string;
}
interface ImageResponse {
  data: [
    {
      url: string;
    },
  ];
  created: string;
  model: string;
  prompt: string;
  delay: string;
}
interface ChatStreamResponse {
  id: "gen-1743262181-GTT1hSZspYAfgykv0nJS";
  provider: "";
  model: "aion-1.0-mini";
  object: "chat.completion.chunk";
  created: 1743262181;
  choices: [
    {
      index: 0;
      delta: { role: "assistant"; content: "" };
      finish_reason: null;
      native_finish_reason: null;
      logprobs: null;
    },
  ];
  usage: { prompt_tokens: 14; completion_tokens: 634; total_tokens: 648 };
  index: 0;
  subCategory: ["other"];
}

class FreedomGPT {
  private apiUrl: string;
  private apiKey: string;

  constructor(apiUrl: string, apiKey: string) {
    this.apiUrl = apiUrl;
    this.apiKey = apiKey;
  }

  async chat(
    messages: Message[],
    deltaCallback?: (value: string) => void,
  ): Promise<string> {
    const requestBody: ChatRequest = {
      messages,
      model: "aion-1.0-mini",
      stream: true,
      max_tokens: 2048,
    };

    const response = await fetch(`${this.apiUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    let reply = "";
    let buffer = "";
    for await (const chunk of response.body as unknown as Uint8Array[]) {
      const text = new TextDecoder("utf-8").decode(chunk).trim();
      text
        .split("data: ")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => {
          buffer += line;

          try {
            const jsonPart: ChatStreamResponse = JSON.parse(buffer); // Try to parse complete JSON
            if (jsonPart.hasOwnProperty("choices")) {
              const delta = jsonPart.choices[0]?.delta;
              if (delta) {
                const { content } = delta;
                reply += content;

                if (deltaCallback) {
                  deltaCallback(content);
                }
              }
            }
            buffer = ""; // Reset buffer after successful parse
          } catch {
            // JSON is incomplete, continue buffering
          }
        });
    }
    //   if (text.includes("choices")) {
    //     console.log(text);
    //     text
    //       .split("\n")
    //       .map((line) => line.replace("data: ", "").trim())
    //       .filter((line) => line.length > 0)
    //       .forEach((line) => {
    //         console.log("line:", line);
    //         const value = JSON.parse(line);
    //         console.log(value);
    //         if (value["choices"]) {
    //           const typedValue: ChatStreamResponse = value;
    //           const delta = typedValue.choices[0]?.delta;
    //           if (delta) {
    //             const { content } = delta;
    //             reply += content;
    //
    //             if (deltaCallback) {
    //               deltaCallback(content);
    //             }
    //           }
    //         }
    //       });
    //   }
    // }

    return reply;
  }

  async generateImage(prompt: string): Promise<ImageResponse> {
    const requestBody: ImageRequest = {
      prompt,
      model: "medusa",
      numberOfImages: 1,
    };

    const response = await fetch(`${this.apiUrl}/images/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`Error: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(data);
    return data;
  }
}

export default FreedomGPT;
