import { describe, expect, it } from "vitest";
import { createCaptureJourney, readCaptureEndpoint } from "./capture-journey";

const previous = { tabId: 10, windowId: 1, pageUrl: "https://origin.example/page" };

describe("capture journey", () => {
  it("classifies a link-opened tab as a new-window handoff", () => {
    expect(createCaptureJourney(
      { tabId: 11, windowId: 2, openerTabId: 10, pageUrl: "https://destination.example" },
      previous,
      "2026-08-28T12:00:00.000Z"
    )).toMatchObject({
      transition: "new-window",
      previousTabId: 10,
      previousPageUrl: "https://origin.example/page",
      mayHaveMissedInitialRequests: true,
    });
  });

  it("distinguishes same-tab navigation and unrelated tab switches", () => {
    expect(createCaptureJourney({ ...previous, pageUrl: "https://next.example" }, previous).transition)
      .toBe("navigation");
    expect(createCaptureJourney(
      { tabId: 12, windowId: 1, pageUrl: "https://other.example" },
      previous
    ).transition).toBe("tab-switch");
  });

  it("rejects malformed session context", () => {
    expect(readCaptureEndpoint({ tabId: "10", windowId: 1, pageUrl: "https://example.com" }))
      .toBeNull();
    expect(readCaptureEndpoint(previous)).toEqual(previous);
  });
});
