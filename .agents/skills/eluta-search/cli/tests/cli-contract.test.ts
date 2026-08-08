import { describe, expect, test } from "bun:test";
import { runCLI } from "./helpers";

describe("Eluta CLI error contract", () => {
  test("detail without an id fails before making a request", async () => {
    const result = await runCLI(["detail"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toEqual({
      error: "detail requires an <id|url>",
      code: "NO_ID",
    });
  });

  test("an invalid numeric option fails before making a request", async () => {
    const result = await runCLI(["search", "--query", "test", "--page", "not-a-number"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    const error = JSON.parse(result.stderr);
    expect(error.code).toBe("BAD_ARG");
    expect(error.error).toMatch(/page/);
  });

  test("unknown command fails with JSON on stderr", async () => {
    const result = await runCLI(["bogus"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toEqual({
      error: 'Unknown command "bogus"',
      code: "BAD_CMD",
    });
  });

  test("detail with an unparseable id fails before making a request", async () => {
    const result = await runCLI(["detail", "https://www.eluta.ca/some-other-page"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    const error = JSON.parse(result.stderr);
    expect(error.code).toBe("BAD_ID");
  });
});
