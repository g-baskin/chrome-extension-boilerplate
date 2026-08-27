const FILENAME_SANITIZE_REGEX = /[^a-zA-Z0-9-_. ]+/g;

export function sanitizeFilename(value: string): string {
  const sanitized = value.replace(FILENAME_SANITIZE_REGEX, "_").trim();
  return sanitized.length > 0 ? sanitized : "capture";
}

export function downloadDataAsFile(
  filename: string,
  data: string,
  mimeType: string
): void {
  const blob = new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
