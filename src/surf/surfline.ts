import puppeteer from "puppeteer";

export async function getSurfLineForecast() {
  // Launch the browser and open a new blank page
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox"],
    timeout: 30000,
  });

  const page = await browser.newPage();

  await page.setRequestInterception(true);
  page.on("request", (request) => {
    if (request.resourceType() === "image") {
      request.abort();
    } else {
      request.continue();
    }
  });

  await page.setUserAgent(
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.108 Safari/537.36",
  );

  // Set screen size.
  await page.setViewport({ width: 1080, height: 1024 });
  // Navigate the page to a URL.
  await page.goto(
    "https://www.surf-forecast.com/breaks/Cloud-Nine/forecasts/latest",
    { waitUntil: "domcontentloaded" },
  );

  // Locate the full title with a unique string.
  await page.waitForSelector(
    ".js-forecast-table-content.forecast-table__table.forecast-table__table--content",
  );

  const forecast = await page.$eval(
    ".js-forecast-table-content.forecast-table__table.forecast-table__table--content",
    (el) => {
      return el.textContent?.replace("Change units", "");
    },
  );

  await browser.close();
  return forecast;
}

getSurfLineForecast();
