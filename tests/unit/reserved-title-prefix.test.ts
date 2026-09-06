import { describe, expect, it } from "vitest";
import { assertReservedTitlePrefix, isReservedTitlePrefix } from "../integration/support/test-books";

describe("reserved title prefix", () => {
  it("accepts [integration-test] and [e2e] titles", () => {
    expect(isReservedTitlePrefix("[integration-test] Alpha")).toBe(true);
    expect(isReservedTitlePrefix("[e2e] Manual journey")).toBe(true);
    expect(() => {
      assertReservedTitlePrefix("[integration-test]");
      assertReservedTitlePrefix("[e2e]-Book-1");
    }).not.toThrow();
  });

  it("rejects a normal title", () => {
    expect(isReservedTitlePrefix("Fourth Wing")).toBe(false);
    expect(() => {
      assertReservedTitlePrefix("Fourth Wing");
    }).toThrow(/reserved fixture title prefix/i);
  });
});
