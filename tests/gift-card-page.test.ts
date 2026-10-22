import { describe, expect, it } from "vitest";
import { giftCardPath, giftCardToken } from "@/lib/gift-card-link";

describe("page de carte cadeau", () => {
  it("jeton stable, base64url, 24 caractères, différent par carte", () => {
    const a = giftCardToken("card_a");
    expect(a).toBe(giftCardToken("card_a"));
    expect(a).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(giftCardToken("card_b")).not.toBe(a);
    expect(giftCardPath("card_a")).toBe(`/gift_cards/card_a/${a}`);
  });
});
