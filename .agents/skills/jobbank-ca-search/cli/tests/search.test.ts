import { afterEach, describe, expect, test } from "bun:test";
import { runSearch } from "../src/commands/search";

const originalFetch = globalThis.fetch;
const originalStdoutWrite = process.stdout.write;

function searchPage(id: string, title: string): string {
  return `<div class="results-summary"><h2><span class="found" id="results-count">1</span> results</h2></div>
  <article id="article-${id}" class="action-buttons"><a href="/jobsearch/jobposting/${id}" class="resultJobItem">
    <h3 class="title"><span class="noctitle">${title}</span></h3>
    <ul class="list-unstyled">
      <li class="date">August 1, 2026</li>
      <li class="business">Acme</li>
      <li class="location">Toronto (ON)</li>
    </ul></a>
  </article>`;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.stdout.write = originalStdoutWrite;
});

describe("runSearch", () => {
  test("--limit 0 emits zero results", async () => {
    globalThis.fetch = (async () => new Response(searchPage("123456", "Engineer"))) as typeof fetch;

    let stdout = "";
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdout += chunk.toString();
      return true;
    }) as typeof process.stdout.write;

    const code = await runSearch({
      jobage: 9999,
      page: 1,
      limit: 0,
      format: "json",
    });

    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.results).toHaveLength(0);
    expect(parsed.meta.total).toBe(1);
  });

  test("without --limit, all parsed results are emitted", async () => {
    globalThis.fetch = (async () => new Response(searchPage("123456", "Engineer"))) as typeof fetch;

    let stdout = "";
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdout += chunk.toString();
      return true;
    }) as typeof process.stdout.write;

    const code = await runSearch({
      jobage: 9999,
      page: 1,
      format: "json",
    });

    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0].id).toBe("123456");
  });
});
