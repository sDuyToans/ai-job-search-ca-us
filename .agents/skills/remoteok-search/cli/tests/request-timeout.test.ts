import { afterEach, describe, expect, test } from "bun:test";
import { jsonFetch } from "../src/helpers";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("jsonFetch request timeout", () => {
  test("passes an AbortSignal timeout to fetch", async () => {
    let init: RequestInit | undefined;
    globalThis.fetch = (async (_url: string | URL | Request, i?: RequestInit) => {
      init = i;
      return new Response(JSON.stringify([]), { status: 200 });
    }) as unknown as typeof fetch;

    await jsonFetch("https://remoteok.com/api");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
});
