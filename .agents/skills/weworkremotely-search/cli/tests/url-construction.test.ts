import { afterEach, describe, expect, test } from "bun:test";
import { fetchFeed } from "../src/helpers";

// Regression: the "all" (site-wide) feed lives at /remote-jobs.rss, not
// /categories/remote-jobs.rss like every other category — the latter 403s
// (confirmed live, 2026-08-07). This pins the URL each category resolves to.

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function captureUrl(): { url: string | undefined } {
  const captured = { url: undefined as string | undefined };
  globalThis.fetch = (async (url: string | URL | Request) => {
    captured.url = String(url);
    return new Response("<rss></rss>", { status: 200 });
  }) as unknown as typeof fetch;
  return captured;
}

describe("fetchFeed URL construction", () => {
  test('"all" resolves to the site-wide /remote-jobs.rss (no /categories/ prefix)', async () => {
    const captured = captureUrl();
    await fetchFeed("all");
    expect(captured.url).toBe("https://weworkremotely.com/remote-jobs.rss");
  });

  test('"programming" resolves under /categories/', async () => {
    const captured = captureUrl();
    await fetchFeed("programming");
    expect(captured.url).toBe("https://weworkremotely.com/categories/remote-programming-jobs.rss");
  });

  test('"full-stack" resolves under /categories/', async () => {
    const captured = captureUrl();
    await fetchFeed("full-stack");
    expect(captured.url).toBe("https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss");
  });
});
