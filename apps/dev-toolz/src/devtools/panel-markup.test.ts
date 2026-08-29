/// <reference types="vite/client" />

import { describe, expect, it } from "vitest";
import devtoolsSource from "./devtools.ts?raw";
import panelMarkup from "./panel.html?raw";

const expectedTags: Record<string, string | null> = {
  Button: "button",
  Dialog: "dialog",
  Element: null,
  Form: "form",
  Input: "input",
  Select: "select",
  Svg: "svg",
};

describe("DevTools panel markup contract", () => {
  it("provides every required runtime control with the expected element type", () => {
    const contracts = [...devtoolsSource.matchAll(/require(Button|Dialog|Element|Form|Input|Select|Svg)\("([^"]+)"\)/g)];
    expect(contracts.length).toBeGreaterThan(0);

    for (const contract of contracts) {
      const helper = contract[1];
      const id = contract[2];
      if (!helper || !id) throw new Error("Invalid runtime markup contract");
      const element = panelMarkup.match(new RegExp(`<([a-z]+)\\b[^>]*\\bid="${id}"[^>]*>`, "i"));
      expect(element, `${id} is missing from panel.html`).not.toBeNull();
      const expectedTag = expectedTags[helper];
      if (expectedTag) expect(element?.[1]?.toLowerCase(), `${id} must be a ${expectedTag}`).toBe(expectedTag);
    }
  });

  it("keeps markup IDs unique", () => {
    const ids = [...panelMarkup.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps the authorized review start control wired as a submit button", () => {
    expect(panelMarkup).toMatch(
      /<button\b[^>]*\bid="purple-review-start"[^>]*\btype="submit"[^>]*\bvalue="confirm"[^>]*>/
    );
    expect(panelMarkup).toContain('id="purple-review-authorized"');
    expect(panelMarkup).toContain('id="purple-review-dialog"');
  });
});
