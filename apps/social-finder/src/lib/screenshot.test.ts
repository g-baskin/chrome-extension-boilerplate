import { describe, expect, it } from "vitest";
import { screenshotDragPayload, screenshotFilename, validScreenshotDataUrl } from "./screenshot";

describe("screenshot handoff", () => {
  it("accepts only bounded PNG data URLs", () => {
    expect(validScreenshotDataUrl("data:image/png;base64,AA==")).toBe(true);
    expect(validScreenshotDataUrl("data:image/jpeg;base64,AA==")).toBe(false);
    expect(validScreenshotDataUrl("https://example.com/image.png")).toBe(false);
  });

  it("creates a filesystem-safe timestamped filename", () => {
    expect(screenshotFilename(new Date("2026-08-31T03:15:20.123Z"))).toBe("social-finder-2026-08-31T03-15-20-123Z.png");
  });

  it("creates Chromium's downloadable drag payload", () => {
    expect(screenshotDragPayload("data:image/png;base64,AA==", "shot.png")).toBe("image/png:shot.png:data:image/png;base64,AA==");
  });
});
