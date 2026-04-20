import { test, expect, describe } from "bun:test";
import { compressWhitespace } from "../../../src/template/compress";

describe("compressWhitespace", () => {
  test("single empty expansion mid-line collapses double space to single", () => {
    // "A [empty] B" -> "A B"
    const result = compressWhitespace("A  B", [
      { start: 2, end: 2, isEmpty: true },
    ]);
    expect(result).toBe("A B");
  });

  test("multiple adjacent empties collapse to single space", () => {
    // "A [empty] [empty] [empty] B" -> "A B"
    const result = compressWhitespace("A     B", [
      { start: 2, end: 2, isEmpty: true },
      { start: 3, end: 3, isEmpty: true },
      { start: 4, end: 4, isEmpty: true },
    ]);
    expect(result).toBe("A B");
  });

  test("empty at line start preserves indent, removes trailing space", () => {
    // "  [empty] Hello" -> "  Hello"
    const result = compressWhitespace("   Hello", [
      { start: 2, end: 2, isEmpty: true },
    ]);
    expect(result).toBe("  Hello");
  });

  test("empty at line end removes leading space", () => {
    // "Hello [empty]" -> "Hello"
    const result = compressWhitespace("Hello ", [
      { start: 6, end: 6, isEmpty: true },
    ]);
    expect(result).toBe("Hello");
  });

  test("non-empty expansions are not compressed", () => {
    const result = compressWhitespace("A value B", [
      { start: 2, end: 7, isEmpty: false },
    ]);
    expect(result).toBe("A value B");
  });

  test("mixed empty and non-empty", () => {
    // "A [empty] B [filled] C" -> "A B [filled] C"
    const result = compressWhitespace("A  B filled C", [
      { start: 2, end: 2, isEmpty: true },
      { start: 4, end: 10, isEmpty: false },
    ]);
    expect(result).toBe("A B filled C");
  });

  test("line that becomes all-empty returns empty string", () => {
    // "[empty] [empty]" -> ""
    const result = compressWhitespace(" ", [
      { start: 0, end: 0, isEmpty: true },
      { start: 1, end: 1, isEmpty: true },
    ]);
    expect(result).toBe("");
  });

  test("no punctuation cleanup - commas and colons preserved", () => {
    // "Name: [empty], Age: [empty]" -> "Name: , Age: "
    // After substitution: "Name: , Age: " (14 chars)
    // Empty X was at position 6 (between ": " and ",")
    // Empty Y was at position 14 (past end of string)
    const result = compressWhitespace("Name: , Age: ", [
      { start: 6, end: 6, isEmpty: true },
      { start: 14, end: 14, isEmpty: true },
    ]);
    expect(result).toBe("Name: , Age: ");
  });

  test("no expansions returns line unchanged", () => {
    const result = compressWhitespace("Hello World", []);
    expect(result).toBe("Hello World");
  });

  test("all non-empty expansions returns line unchanged", () => {
    const result = compressWhitespace("Hello World Foo", [
      { start: 6, end: 11, isEmpty: false },
    ]);
    expect(result).toBe("Hello World Foo");
  });

  test("empty expansion with no adjacent spaces", () => {
    // edge: directly touching text
    const result = compressWhitespace("AB", [
      { start: 1, end: 1, isEmpty: true },
    ]);
    expect(result).toBe("AB");
  });

  test("tab indent is preserved", () => {
    const result = compressWhitespace("\t Hello", [
      { start: 1, end: 1, isEmpty: true },
    ]);
    expect(result).toBe("\tHello");
  });
});
