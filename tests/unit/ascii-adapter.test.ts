import { test, expect, describe } from "bun:test";
import { AsciiAdapter } from "../../src/renderer/ascii-adapter.ts";

describe("AsciiAdapter", () => {
  const adapter = new AsciiAdapter();

  describe("bulletChar", () => {
    test("depth 0 returns '*'", () => {
      expect(adapter.bulletChar(0)).toBe("*");
    });

    test("depth 1 returns '-'", () => {
      expect(adapter.bulletChar(1)).toBe("-");
    });

    test("depth 2 returns '+'", () => {
      expect(adapter.bulletChar(2)).toBe("+");
    });

    test("depth 3 cycles back to '*'", () => {
      expect(adapter.bulletChar(3)).toBe("*");
    });
  });

  describe("hrRule", () => {
    test("returns dashes repeated to width", () => {
      expect(adapter.hrRule(40)).toBe("-".repeat(40));
    });

    test("returns dashes for width 10", () => {
      expect(adapter.hrRule(10)).toBe("----------");
    });
  });

  describe("tableChars", () => {
    test("returns ASCII table characters", () => {
      const chars = adapter.tableChars();
      expect(chars.topLeft).toBe("+");
      expect(chars.topRight).toBe("+");
      expect(chars.bottomLeft).toBe("+");
      expect(chars.bottomRight).toBe("+");
      expect(chars.horizontal).toBe("-");
      expect(chars.vertical).toBe("|");
      expect(chars.cross).toBe("+");
      expect(chars.topTee).toBe("+");
      expect(chars.bottomTee).toBe("+");
      expect(chars.leftTee).toBe("+");
      expect(chars.rightTee).toBe("+");
    });
  });

  describe("quoteBar", () => {
    test("returns '|'", () => {
      expect(adapter.quoteBar()).toBe("|");
    });
  });

  describe("orderedMarker", () => {
    test("returns index with dot", () => {
      expect(adapter.orderedMarker(1)).toBe("1.");
      expect(adapter.orderedMarker(10)).toBe("10.");
    });
  });

  describe("headingPrefix", () => {
    test("returns hash marks for level", () => {
      expect(adapter.headingPrefix(1)).toBe("#");
      expect(adapter.headingPrefix(2)).toBe("##");
      expect(adapter.headingPrefix(3)).toBe("###");
    });
  });

  describe("codeIndent", () => {
    test("returns 4 spaces", () => {
      expect(adapter.codeIndent()).toBe("    ");
    });
  });
});
