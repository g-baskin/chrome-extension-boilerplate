import { describe, expect, it } from "vitest";
import { canonicalMarketplaceItemUrl, getFacebookPageKey, getFacebookSurface, getMarketplaceItemId } from "./facebook-url";

describe("Facebook URL boundaries", () => {
  it("supports only exact HTTPS Facebook hosts", () => {
    expect(getFacebookSurface("https://www.facebook.com/")).toBe("feed");
    expect(getFacebookSurface("https://facebook.com/home.php?ref=logo")).toBe("feed");
    expect(getFacebookSurface("http://www.facebook.com/")).toBe("unsupported");
    expect(getFacebookSurface("https://facebook.com.evil.test/")).toBe("unsupported");
  });

  it("classifies Ad Library and Marketplace routes", () => {
    expect(getFacebookSurface("https://www.facebook.com/ads/library/?q=Nike")).toBe("ad-library");
    expect(getFacebookSurface("https://www.facebook.com/marketplace/")).toBe("marketplace");
    expect(getFacebookSurface("https://facebook.com/marketplace/search/?query=desk")).toBe("marketplace");
    expect(getFacebookSurface("https://www.facebook.com/groups/example")).toBe("unsupported");
  });

  it("changes page identity when an Ad Library query changes", () => {
    const nike = getFacebookPageKey("https://www.facebook.com/ads/library/?q=Nike&country=US");
    const adidas = getFacebookPageKey("https://www.facebook.com/ads/library/?country=US&q=Adidas");
    expect(nike).not.toBe(adidas);
    expect(nike).toBe(getFacebookPageKey("https://www.facebook.com/ads/library/?country=US&q=Nike"));
  });

  it("accepts bounded numeric Marketplace item IDs", () => {
    expect(getMarketplaceItemId("https://www.facebook.com/marketplace/item/123456/?ref=browse_tab")).toBe("123456");
    expect(canonicalMarketplaceItemUrl("https://facebook.com/marketplace/item/123456?tracking=x")).toBe("https://www.facebook.com/marketplace/item/123456/");
    expect(getMarketplaceItemId("https://www.facebook.com/marketplace/item/not-a-number/")).toBeNull();
    expect(getMarketplaceItemId("https://example.com/marketplace/item/123/")).toBeNull();
  });
});
