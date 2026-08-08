import { afterEach, describe, expect, test } from "bun:test";
import { htmlFetch } from "../src/helpers";

// Eluta redirects to /sandbox?destination=... ("User Verification") under a
// burst of automated requests — confirmed live (2026-08-07), and fetch()
// follows that redirect transparently, so the only way to catch it is by
// inspecting the final body. Silently returning this page would otherwise
// get parsed as an empty/"(untitled)" result instead of a clear signal.

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("htmlFetch bot-verification detection", () => {
  test("throws a clear error when the response is the User Verification sandbox page", async () => {
    globalThis.fetch = (async () =>
      new Response("<html><head><title>User Verification | Eluta.ca</title></head><body></body></html>", {
        status: 200,
      })) as unknown as typeof fetch;

    await expect(htmlFetch("https://www.eluta.ca/search?q=x")).rejects.toThrow(/bot-verification/i);
  });

  test("does not false-positive on a normal page mentioning verification elsewhere in the body", async () => {
    globalThis.fetch = (async () =>
      new Response("<html><head><title>Software Engineer / Acme | Eluta.ca</title></head><body>Verification of employment available on request.</body></html>", {
        status: 200,
      })) as unknown as typeof fetch;

    const html = await htmlFetch("https://www.eluta.ca/spl/x");
    expect(html).toContain("Software Engineer");
  });
});
