import { openai } from "./ai.ts";

export async function generateImage(
  prompt: string,
): Promise<string | undefined> {
  const response = await openai.images.generate({
    model: "dall-e-3",
    prompt,
    n: 1,
    size: "1024x1024",
  });
  return response.data[0].url;
}
