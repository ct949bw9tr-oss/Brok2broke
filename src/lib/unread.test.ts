import { describe, expect, it } from "vitest";
import { isUnread } from "./unread";

describe("isUnread", () => {
  it("treats -infinity as never read", () => {
    expect(isUnread("2026-10-06T10:00:00Z", "-infinity")).toBe(true);
  });
  it("compares timestamps", () => {
    expect(isUnread("2026-10-06T10:00:00Z", "2026-10-06T09:00:00Z")).toBe(true);
    expect(isUnread("2026-10-06T10:00:00Z", "2026-10-06T10:00:00Z")).toBe(false);
  });
});
