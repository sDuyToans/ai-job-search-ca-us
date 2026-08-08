import { afterEach, describe, expect, test } from "bun:test";
import { fetchFeed } from "../src/helpers";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("fetchFeed request timeout", () => {
  test("passes an AbortSignal timeout to fetch", async () => {
    let init: RequestInit | undefined;
    globalThis.fetch = (async (_url: string | URL | Request, i?: RequestInit) => {
      init = i;
      return new Response("<rss></rss>", { status: 200 });
    }) as unknown as typeof fetch;

    await fetchFeed("programming");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
});
