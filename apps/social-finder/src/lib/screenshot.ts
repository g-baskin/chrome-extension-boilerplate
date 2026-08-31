const PNG_PREFIX = "data:image/png;base64,";
const MAX_SCREENSHOT_LENGTH = 20_000_000;

export function validScreenshotDataUrl(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(PNG_PREFIX) && value.length <= MAX_SCREENSHOT_LENGTH;
}

export function screenshotFilename(capturedAt: Date): string {
  return `social-finder-${capturedAt.toISOString().replace(/[:.]/g, "-")}.png`;
}

export function screenshotDragPayload(dataUrl: string, filename: string): string {
  return `image/png:${filename}:${dataUrl}`;
}
