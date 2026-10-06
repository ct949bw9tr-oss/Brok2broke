import { describe, expect, it } from "vitest";
import {
  formatPrice,
  listingPriceLabel,
  nextMarketDate,
  parsePriceToCents,
  platformFeeCents,
  safeRedirectPath,
} from "./catalog";

describe("parsePriceToCents", () => {
  it("parses dots and commas", () => {
    expect(parsePriceToCents("12")).toBe(1200);
    expect(parsePriceToCents("12.5")).toBe(1250);
    expect(parsePriceToCents("12,99")).toBe(1299);
  });
  it("rejects junk, zero and huge amounts", () => {
    expect(parsePriceToCents("")).toBeNull();
    expect(parsePriceToCents("0")).toBeNull();
    expect(parsePriceToCents("-3")).toBeNull();
    expect(parsePriceToCents("1.234")).toBeNull();
    expect(parsePriceToCents("abc")).toBeNull();
    expect(parsePriceToCents("1000000")).toBeNull();
  });
});

describe("prices", () => {
  it("formats per currency", () => {
    expect(formatPrice(1500, "USD")).toBe("$15");
    expect(formatPrice(1250, "GBP")).toBe("£12.50");
  });
  it("labels free and swap listings", () => {
    expect(listingPriceLabel({ kind: "free", price_cents: 0, currency: "USD" })).toBe("Free");
    expect(listingPriceLabel({ kind: "swap", price_cents: 0, currency: "USD" })).toBe("Swap");
  });
});

describe("nextMarketDate", () => {
  it("returns the coming Sunday", () => {
    // Tuesday 6 Oct 2026, 15:00 UTC
    expect(nextMarketDate(new Date("2026-10-06T15:00:00Z"), "America/New_York")).toBe("2026-10-11");
  });
  it("returns today on a Sunday", () => {
    expect(nextMarketDate(new Date("2026-10-11T15:00:00Z"), "Europe/London")).toBe("2026-10-11");
  });
  it("uses the campus time zone", () => {
    // Saturday 23:30 in Boston is already Sunday in Dubai.
    const now = new Date("2026-10-11T03:30:00Z");
    expect(nextMarketDate(now, "America/New_York")).toBe("2026-10-11");
    expect(nextMarketDate(now, "Asia/Dubai")).toBe("2026-10-11");
    expect(nextMarketDate(new Date("2026-10-12T01:00:00Z"), "America/Los_Angeles")).toBe("2026-10-11");
    expect(nextMarketDate(new Date("2026-10-12T01:00:00Z"), "Asia/Dubai")).toBe("2026-10-18");
  });
});

describe("safeRedirectPath", () => {
  it("keeps relative paths and blocks open redirects", () => {
    expect(safeRedirectPath("/market")).toBe("/market");
    expect(safeRedirectPath("//evil.com")).toBe("/browse");
    expect(safeRedirectPath("https://evil.com")).toBe("/browse");
    expect(safeRedirectPath(null)).toBe("/browse");
  });
});

describe("platformFeeCents", () => {
  it("takes 10% rounded to the cent", () => {
    expect(platformFeeCents(1500)).toBe(150);
    expect(platformFeeCents(1299)).toBe(130);
    expect(platformFeeCents(55)).toBe(6);
  });
});
