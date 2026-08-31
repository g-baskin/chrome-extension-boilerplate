import { getFacebookSurface } from "./facebook-url";

export const FACEBOOK_ONLY_MESSAGE = "Ad rescanning works only on Meta Ad Library, Facebook Feed, or Marketplace.";
export const FACEBOOK_RELOAD_MESSAGE = "Reload this Facebook tab, then try again.";

export function supportsAdRescan(tabUrl: unknown): tabUrl is string {
  return typeof tabUrl === "string" && getFacebookSurface(tabUrl) !== "unsupported";
}

export function adRescanErrorMessage(reason: unknown, tabUrl: unknown): string {
  if (!supportsAdRescan(tabUrl)) return FACEBOOK_ONLY_MESSAGE;
  const message = reason instanceof Error ? reason.message : String(reason);
  return message === FACEBOOK_RELOAD_MESSAGE || /receiving end does not exist|could not establish connection/i.test(message)
    ? FACEBOOK_RELOAD_MESSAGE
    : "Social Finder could not scan this Facebook tab.";
}
