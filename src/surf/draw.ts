import { learnedSummary, openai } from "./ai.ts";

export async function generateImage(
  prompt: string,
): Promise<string | undefined> {
  const summary = await learnedSummary().then((t) => t.content);
  const response = await openai.images.generate({
    model: "dall-e-3",
    prompt: `Context: ${summary}
    Actual prompt for the image is below in format {sender}: {prompt}.
    ${prompt}`,
    n: 1,
    size: "1024x1024",
  });
  const image_url = response.data[0].url;
  return image_url;
}
