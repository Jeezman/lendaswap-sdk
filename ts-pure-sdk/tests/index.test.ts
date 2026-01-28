import { describe, expect, it } from "vitest";
import { VERSION } from "../src/index.js";

describe("ts-pure-sdk", () => {
  it("should export VERSION", () => {
    expect(VERSION).toBe("0.0.1");
  });
});
