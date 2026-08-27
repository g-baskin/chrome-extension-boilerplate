import type { CaptureMetadata, CaptureRequest, CaptureResponse, CaptureScope } from "@/lib/capture";
import "./content.css";

console.log("[Content Script] Loaded on:", window.location.href);

// Listen for messages from background or popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log("[Content Script] Message received:", message);

  switch (message.type) {
    case "CONTENT_ACTION": {
      const result = handleContentAction(message.payload);
      sendResponse({ success: true, data: result });
      break;
    }

    case "CAPTURE_SKILL_PAGE": {
      handleCapturePage(message.payload)
        .then((response) => sendResponse({ success: true, data: response }))
        .catch((error) =>
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : "Capture failed",
          })
        );
      break;
    }

    case "EXTENSION_STATE_CHANGED": {
      handleExtensionStateChange(message.payload.enabled);
      sendResponse({ success: true });
      break;
    }

    case "GET_TAB_INFO": {
      sendResponse({
        success: true,
        data: {
          url: window.location.href,
          title: document.title,
        },
      });
      break;
    }

    default:
      sendResponse({ success: false, error: "Unknown message type" });
  }

  return true; // Keep message channel open for async response
});

async function handleCapturePage(
  request: CaptureRequest
): Promise<CaptureResponse> {
  if (request.scrollToBottom) {
    await scrollThroughPage();
  }

  const capturedAt = Date.now();
  const posts = captureSkoolPosts(request.scope ?? "auto");
  const metadata = buildCaptureMetadata(posts, capturedAt);
  const markdown = request.includeMarkdown ? buildMarkdownSnapshot(posts, metadata) : undefined;
  const html = request.includeHtml ? buildHtmlSnapshot(posts) : undefined;

  return {
    metadata,
    markdown,
    html,
  };
}

function captureSkoolPosts(scope: CaptureScope = "auto"): PostSnapshot[] {
  const root = findFeedRoot(scope);
  const selectors = [
    "article",
    "[role='article']",
    ".post-card",
    ".skool-post-card",
    ".thread-card",
    ".feed-item",
    "[data-post-id]",
  ];

  const matches = selectors.flatMap((selector) =>
    Array.from(root.querySelectorAll<HTMLElement>(selector))
  );

  const uniqueElements = dedupeElements(matches);
  const filtered = uniqueElements.filter(
    (element) => (element.textContent?.trim().length ?? 0) > 20
  );

  return filtered.slice(0, 40).map((element, index) => ({
    referenceId: element.id || `capture-post-${index}`,
    title: extractTitle(element),
    author: extractAuthor(element),
    timestamp: extractTimestamp(element),
    paragraphs: extractParagraphs(element),
    links: extractLinks(element),
  }));
}

function buildCaptureMetadata(posts: PostSnapshot[], capturedAt: number): CaptureMetadata {
  const combinedText = posts
    .flatMap((post) => post.paragraphs)
    .join(" ")
    .trim();
  const fallback = document.body.textContent?.trim() ?? "";
  const snippetSource = combinedText || fallback;

  return {
    url: window.location.href,
    title: document.title,
    capturedAt,
    authors: ensureUniqueStrings(posts.map((post) => post.author)),
    timestamps: ensureUniqueStrings(posts.map((post) => post.timestamp)),
    wordCount: Math.max(countWords(combinedText), countWords(fallback)),
    linkCount: posts.reduce((sum, post) => sum + post.links.length, 0),
    postCount: Math.max(posts.length, 1),
    snippet: snippetSource.substring(0, 200),
  };
}

function buildMarkdownSnapshot(
  posts: PostSnapshot[],
  metadata: CaptureMetadata
): string {
  const headerLines = [
    `# ${metadata.title || "Skool Capture"}`,
    "",
    `- URL: ${metadata.url}`,
    `- Captured: ${new Date(metadata.capturedAt).toLocaleString()}`,
    `- Posts: ${metadata.postCount}`,
    `- Words: ${metadata.wordCount}`,
    `- Links: ${metadata.linkCount}`,
  ];

  if (metadata.authors.length) {
    headerLines.push(`- Authors: ${metadata.authors.join(", ")}`);
  }

  if (metadata.snippet) {
    headerLines.push("", "> " + metadata.snippet.replace(/\n/g, " "), "");
  }

  const postSections = posts.map((post, index) => {
    const lines: string[] = [];
    lines.push(post.title ? `## ${post.title}` : `## Post ${index + 1}`);

    if (post.author) {
      lines.push(`**Author:** ${post.author}`);
    }

    if (post.timestamp) {
      lines.push(`**Posted:** ${post.timestamp}`);
    }

    if (post.paragraphs.length) {
      lines.push("", ...post.paragraphs);
    }

    if (post.links.length) {
      lines.push("", "**Links:**");
      lines.push(
        ...post.links.map((link) => {
          const text = link.text || link.href;
          return `- [${text?.trim() || "link"}](${link.href})`;
        })
      );
    }

    return lines.join("\n");
  });

  const aggregatedLinks = aggregateLinks(posts);
  const linkSection = aggregatedLinks.length
    ? [
        "## Link Summary",
        "",
        ...aggregatedLinks.map((link) => {
          const text = link.text || link.href;
          return `- [${text?.trim() || "link"}](${link.href})`;
        }),
        "",
      ]
    : [];

  const fallbackText = posts.length === 0 ? [document.body.textContent?.trim() ?? ""] : [];

  return [
    ...headerLines,
    ...postSections,
    ...linkSection,
    ...fallbackText,
  ]
    .filter((line) => line !== undefined)
    .join("\n\n")
    .trim();
}

function buildHtmlSnapshot(posts: PostSnapshot[]): string {
  const clone = document.createElement("div");
  clone.innerHTML = "";

  const header = document.createElement("header");
  const title = document.createElement("h1");
  title.textContent = document.title;
  header.appendChild(title);

  const meta = document.createElement("p");
  meta.innerHTML = `Captured on ${new Date().toLocaleString()} · ${document.location.href}`;
  header.appendChild(meta);

  clone.appendChild(header);

  posts.forEach((post, index) => {
    const section = document.createElement("section");
    section.setAttribute("data-capture-index", String(index));

    const heading = document.createElement("h2");
    heading.textContent = post.title || `Post ${index + 1}`;
    section.appendChild(heading);

    if (post.author) {
      const author = document.createElement("p");
      author.innerHTML = `<strong>Author:</strong> ${post.author}`;
      section.appendChild(author);
    }

    if (post.timestamp) {
      const timestamp = document.createElement("p");
      timestamp.innerHTML = `<strong>Posted:</strong> ${post.timestamp}`;
      section.appendChild(timestamp);
    }

    post.paragraphs.forEach((paragraph) => {
      const paragraphNode = document.createElement("p");
      paragraphNode.textContent = paragraph;
      section.appendChild(paragraphNode);
    });

    if (post.links.length) {
      const linksHeading = document.createElement("p");
      linksHeading.innerHTML = "<strong>Links:</strong>";
      section.appendChild(linksHeading);

      const linkList = document.createElement("ul");
      post.links.forEach((link) => {
        const item = document.createElement("li");
        const anchor = document.createElement("a");
        anchor.href = link.href;
        anchor.textContent = link.text || link.href;
        anchor.target = "_blank";
        item.appendChild(anchor);
        linkList.appendChild(item);
      });
      section.appendChild(linkList);
    }

    clone.appendChild(section);
  });

  const styles = `<style>
body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 24px; background: #f8fafc; color: #0f172a; }
header { margin-bottom: 32px; }
section { border-bottom: 1px solid #e2e8f0; margin-bottom: 24px; padding-bottom: 16px; }
h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
h2 { font-size: 1.25rem; margin-bottom: 0.25rem; }
strong { color: #0369a1; }
ul { padding-left: 1rem; }
</style>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${document.title}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
${styles}
</head>
<body>
${clone.innerHTML}
</body>
</html>`;
}

function findFeedRoot(scope: CaptureScope): HTMLElement {
  if (scope === "overview") {
    return findModuleOverviewRoot() ?? document.body;
  }

  const overviewCandidate = findModuleOverviewRoot();
  if (scope === "auto" && overviewCandidate) {
    return overviewCandidate;
  }

  const selectors = [
    "main",
    "[data-testid='feed']",
    ".feed",
    "#skool-root",
    ".skool-feed",
  ];

  for (const selector of selectors) {
    const node = document.querySelector<HTMLElement>(selector);
    if (node && isVisible(node)) {
      return node;
    }
  }

  return document.body;
}

function findModuleOverviewRoot(): HTMLElement | null {
  const modules = [
    "[data-testid='module-overview']",
    ".module-overview",
    ".module-detail-dialog",
    ".module-detail",
    ".skool-module-detail",
    ".skool-module-preview",
    "[data-module-overview]",
  ];

  for (const selector of modules) {
    const node = document.querySelector<HTMLElement>(selector);
    if (node && isVisible(node)) {
      return node;
    }
  }

  const dialog = document.querySelector<HTMLElement>("[role='dialog']");
  if (dialog && isVisible(dialog)) {
    return dialog;
  }

  return null;
}

function isVisible(element?: Element | null): element is HTMLElement {
  if (!element || !(element instanceof HTMLElement)) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
    return false;
  }

  return rect.width > 0 && rect.height > 0;
}

async function scrollThroughPage(): Promise<void> {
  const maxIterations = 30;
  const delayMs = 400;
  let previousHeight = -1;

  for (let i = 0; i < maxIterations; i += 1) {
    window.scrollBy({ top: window.innerHeight * 0.9, behavior: "auto" });
    await timeout(delayMs);

    const currentHeight = document.documentElement.scrollHeight;
    if (currentHeight === previousHeight || window.scrollY + window.innerHeight >= currentHeight - 50) {
      break;
    }
    previousHeight = currentHeight;
  }

  window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
}

function timeout(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dedupeElements(elements: HTMLElement[]): HTMLElement[] {
  const unique = Array.from(new Set(elements));
  return unique.filter(
    (element) => !unique.some((other) => other !== element && other.contains(element))
  );
}

function extractAuthor(element: Element): string | undefined {
  const selectors = [
    "[data-author-name]",
    "[data-author]",
    "[data-testid='author-name']",
    ".author-name",
    ".post-author",
    ".skool-card__author",
    ".thread-author",
    ".skool-profile-name",
    ".user-name",
  ];

  for (const selector of selectors) {
    const node = element.querySelector(selector);
    const text = normalizeText(node?.textContent);
    if (text) {
      return text;
    }
  }

  return undefined;
}

function extractTimestamp(element: Element): string | undefined {
  const selectors = [
    "time",
    ".timestamp",
    ".post-date",
    ".skool-card__time",
    ".relative-time",
  ];

  for (const selector of selectors) {
    const node = element.querySelector<HTMLElement>(selector);
    if (!node) {
      continue;
    }

    const value =
      node.getAttribute("datetime") ??
      node.getAttribute("data-datetime") ??
      node.textContent;

    const text = normalizeText(value);
    if (text) {
      return text;
    }
  }

  return undefined;
}

function extractTitle(element: Element): string | undefined {
  const selectors = [
    "h1",
    "h2",
    "h3",
    ".post-title",
    ".skool-post-title",
    ".thread-title",
  ];

  for (const selector of selectors) {
    const node = element.querySelector(selector);
    const text = normalizeText(node?.textContent);
    if (text) {
      return text;
    }
  }

  return undefined;
}

function extractParagraphs(element: Element): string[] {
  const nodes = Array.from(element.querySelectorAll("p, li, blockquote"));
  const paragraphs = nodes
    .map((node) => normalizeText(node.textContent))
    .filter((text): text is string => Boolean(text));

  if (!paragraphs.length) {
    const fallback = normalizeText(element.textContent);
    if (fallback) {
      paragraphs.push(fallback);
    }
  }

  return paragraphs;
}

function extractLinks(element: Element): LinkSummary[] {
  const anchors = Array.from(element.querySelectorAll<HTMLAnchorElement>("a[href]"));
  const seen = new Set<string>();

  return anchors
    .map((anchor) => ({
      text: normalizeText(anchor.textContent) ?? anchor.getAttribute("aria-label") ?? undefined,
      href: anchor.href,
    }))
    .filter((link) => {
      if (!link.href) {
        return false;
      }
      if (seen.has(link.href)) {
        return false;
      }
      seen.add(link.href);
      return true;
    });
}

function aggregateLinks(posts: PostSnapshot[]): LinkSummary[] {
  const seen = new Set<string>();
  const links: LinkSummary[] = [];

  for (const post of posts) {
    for (const link of post.links) {
      const key = `${link.text ?? ""}::${link.href}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      links.push(link);
    }
  }

  return links;
}

function normalizeText(value?: string | null): string | undefined {
  if (!value) {
    return undefined;
  }

  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned || undefined;
}

function ensureUniqueStrings(items: (string | undefined)[]): string[] {
  return Array.from(new Set(items.filter((value): value is string => Boolean(value))));
}

function countWords(value?: string): number {
  if (!value) {
    return 0;
  }
  return value
    .trim()
    .split(/\s+/)
    .filter((token) => Boolean(token)).length;
}

interface PostSnapshot {
  referenceId: string;
  title?: string;
  author?: string;
  timestamp?: string;
  paragraphs: string[];
  links: LinkSummary[];
}

interface LinkSummary {
  text?: string;
  href: string;
}

/**
 * Handle content actions from background/popup
 */
function handleContentAction(payload: { action: string; data?: unknown }): unknown {
  console.log("[Content Script] Handling action:", payload.action);

  switch (payload.action) {
    case "highlight":
      highlightPage();
      return { highlighted: true };

    case "getData":
      return getPageData();

    case "inject":
      injectElement();
      return { injected: true };

    default:
      console.warn("[Content Script] Unknown action:", payload.action);
      return null;
  }
}

/**
 * Handle extension state changes
 */
function handleExtensionStateChange(enabled: boolean): void {
  console.log("[Content Script] Extension state changed:", enabled);

  if (enabled) {
    // Extension enabled - activate features
    document.body.classList.add("extension-active");
  } else {
    // Extension disabled - deactivate features
    document.body.classList.remove("extension-active");
    removeInjectedElements();
  }
}

/**
 * Example: Highlight page elements
 */
function highlightPage(): void {
  const style = document.createElement("style");
  style.id = "extension-highlight-style";
  style.textContent = `
    * {
      outline: 1px solid rgba(59, 130, 246, 0.3) !important;
    }
  `;
  document.head.appendChild(style);

  // Remove after 3 seconds
  setTimeout(() => {
    style.remove();
  }, 3000);
}

/**
 * Example: Get page data
 */
function getPageData(): object {
  return {
    url: window.location.href,
    title: document.title,
    description:
      document
        .querySelector('meta[name="description"]')
        ?.getAttribute("content") ?? "",
    headings: Array.from(document.querySelectorAll("h1, h2, h3")).map(
      (h) => h.textContent?.trim() ?? ""
    ),
    links: document.querySelectorAll("a").length,
    images: document.querySelectorAll("img").length,
  };
}

/**
 * Example: Inject a floating element
 */
function injectElement(): void {
  // Remove existing if present
  removeInjectedElements();

  const container = document.createElement("div");
  container.id = "extension-injected-element";
  container.innerHTML = `
    <div class="extension-floating-widget">
      <button class="extension-close-btn">&times;</button>
      <div class="extension-widget-content">
        <h3>Chrome Extension</h3>
        <p>This is an injected widget!</p>
      </div>
    </div>
  `;

  document.body.appendChild(container);

  // Add close functionality
  container.querySelector(".extension-close-btn")?.addEventListener("click", () => {
    container.remove();
  });
}

/**
 * Remove injected elements
 */
function removeInjectedElements(): void {
  document.getElementById("extension-injected-element")?.remove();
  document.getElementById("extension-highlight-style")?.remove();
}

// Initialize content script
async function init(): Promise<void> {
  // Check if extension is enabled
  try {
    const response = await chrome.runtime.sendMessage({
      type: "GET_SETTINGS",
      payload: undefined,
    });

    if (response?.success && response.data?.enabled) {
      document.body.classList.add("extension-active");
    }
  } catch (error) {
    console.error("[Content Script] Failed to get settings:", error);
  }
}

// Run initialization
init();

// Export for type checking
export {};
