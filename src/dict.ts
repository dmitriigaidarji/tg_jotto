const dicApiURL = "https://api.dictionaryapi.dev/api/v2/entries/en/";

export function validateEnglishWord(text: string): Promise<boolean> {
  return fetch(dicApiURL + encodeURIComponent(text))
    .then((r) => r.status === 200)
    .catch(() => false);
}
