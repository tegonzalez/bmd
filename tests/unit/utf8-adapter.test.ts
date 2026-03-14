import { test, expect, describe } from "bun:test";
import { Utf8Adapter } from "../../src/renderer/utf8-adapter.ts";

describe("Utf8Adapter", () => {
  const adapter = new Utf8Adapter();

  describe("bulletChar", () => {
    test("depth 0 returns bullet U+2022", () => {
      expect(adapter.bulletChar(0)).toBe("\u2022");
    });

    test("depth 1 returns circle U+25E6", () => {
      expect(adapter.bulletChar(1)).toBe("\u25E6");
    });

    test("depth 2 returns square U+25AA", () => {
      expect(adapter.bulletChar(2)).toBe("\u25AA");
    });

    test("depth 3 cycles back to bullet", () => {
      expect(adapter.bulletChar(3)).toBe("\u2022");
    });
  });

  describe("hrRule", () => {
    test("returns horizontal box drawing chars repeated to width", () => {
      const rule = adapter.hrRule(20);
      expect(rule).toBe("\u2500".repeat(20));
    });
  });

  describe("tableChars", () => {
    test("returns Unicode box drawing characters", () => {
      const chars = adapter.tableChars();
      expect(chars.topLeft).toBe("\u250C");
      expect(chars.topRight).toBe("\u2510");
      expect(chars.bottomLeft).toBe("\u2514");
      expect(chars.bottomRight).toBe("\u2518");
      expect(chars.horizontal).toBe("\u2500");
      expect(chars.vertical).toBe("\u2502");
      expect(chars.cross).toBe("\u253C");
      expect(chars.topTee).toBe("\u252C");
      expect(chars.bottomTee).toBe("\u2534");
      expect(chars.leftTee).toBe("\u251C");
      expect(chars.rightTee).toBe("\u2524");
    });
  });

  describe("quoteBar", () => {
    test("returns vertical box drawing char U+2502", () => {
      expect(adapter.quoteBar()).toBe("\u2502");
    });
  });

  describe("orderedMarker", () => {
    test("returns index with dot", () => {
      expect(adapter.orderedMarker(1)).toBe("1.");
      expect(adapter.orderedMarker(10)).toBe("10.");
    });
  });

  describe("headingPrefix", () => {
    test("returns empty string (style from ANSI layer)", () => {
      expect(adapter.headingPrefix(1)).toBe("");
      expect(adapter.headingPrefix(3)).toBe("");
    });
  });

  describe("codeIndent", () => {
    test("returns 4 spaces", () => {
      expect(adapter.codeIndent()).toBe("    ");
    });
  });
});
