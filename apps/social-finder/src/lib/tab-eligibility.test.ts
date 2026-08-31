import { describe, expect, it } from "vitest";
import {
  adRescanErrorMessage,
  FACEBOOK_ONLY_MESSAGE,
  FACEBOOK_RELOAD_MESSAGE,
  supportsAdRescan,
} from "./tab-eligibility";

describe("ad rescan tab eligibility", () => {
  it("accepts only supported Facebook surfaces", () => {
    expect(supportsAdRescan("https://www.facebook.com/ads/library/?q=Nike")).toBe(true);
    expect(supportsAdRescan("https://www.facebook.com/marketplace/")).toBe(true);
    expect(supportsAdRescan("https://www.nike.com/product")).toBe(false);
    expect(supportsAdRescan(undefined)).toBe(false);
  });

  it("returns a Facebook-only message for unsupported or hidden tab URLs", () => {
    const missingReceiver = new Error("Could not establish connection. Receiving end does not exist.");
    expect(adRescanErrorMessage(missingReceiver, "https://www.nike.com/product")).toBe(FACEBOOK_ONLY_MESSAGE);
    expect(adRescanErrorMessage(missingReceiver, undefined)).toBe(FACEBOOK_ONLY_MESSAGE);
  });

  it("asks for a reload when a supported Facebook tab lacks its receiver", () => {
    expect(
      adRescanErrorMessage(
        new Error("Could not establish connection. Receiving end does not exist."),
        "https://www.facebook.com/ads/library/",
      ),
    ).toBe(FACEBOOK_RELOAD_MESSAGE);
  });
});
