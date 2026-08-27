export interface CaptureMetadata {
  url: string;
  title: string;
  capturedAt: number;
  authors: string[];
  timestamps: string[];
  wordCount: number;
  linkCount: number;
  postCount: number;
  snippet: string;
}

export type CaptureScope = "auto" | "overview" | "full";

export interface CaptureRequest {
  includeMarkdown?: boolean;
  includeHtml?: boolean;
  scrollToBottom?: boolean;
  scope?: CaptureScope;
}

export interface CaptureResponse {
  metadata: CaptureMetadata;
  markdown?: string;
  html?: string;
}

export interface CapturedPageSummary extends CaptureMetadata {
  id: string;
}

export interface CapturedPageEntry extends CapturedPageSummary {
  markdown: string;
  html: string;
}

export const CAPTURE_HISTORY_LIMIT = 50;
