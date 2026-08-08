import { describe, test, expect } from "bun:test";
import { runCLI } from "./helpers";

function parsedStderr(stderr: string): { error?: string; code?: string } {
  try {
    return JSON.parse(stderr);
  } catch {
    return {};
  }
}

describe("We Work Remotely CLI flag validation", () => {
  describe("--page NaN validation", () => {
    test("non-numeric string exits 1 with BAD_ARG", async () => {
      const result = await runCLI(["search", "--page", "abc"]);
      expect(result.exitCode).not.toBe(0);
      const err = parsedStderr(result.stderr);
      expect(err.code).toBe("BAD_ARG");
      expect(err.error).toMatch(/page/);
    });
  });

  describe("--limit NaN validation", () => {
    test("non-numeric string exits 1 with BAD_ARG", async () => {
      const result = await runCLI(["search", "--limit", "xyz"]);
      expect(result.exitCode).not.toBe(0);
      const err = parsedStderr(result.stderr);
      expect(err.code).toBe("BAD_ARG");
      expect(err.error).toMatch(/limit/);
    });
  });

  describe("--category validation", () => {
    test("valid category values all pass", async () => {
      for (const c of ["programming", "full-stack", "backend", "frontend", "devops", "all"]) {
        const result = await runCLI(["search", "-c", c, "--limit", "0"]);
        const err = parsedStderr(result.stderr);
        expect(err.code).not.toBe("BAD_ARG");
      }
    });
  });

  describe("existing validations (regression)", () => {
    test("all valid flags produce no BAD_ARG", async () => {
      const result = await runCLI([
        "search", "-q", "react", "-l", "world", "-c", "full-stack", "--page", "1", "--limit", "1",
      ]);
      const err = parsedStderr(result.stderr);
      expect(err.code).not.toBe("BAD_ARG");
    });
  });
});
