import browser from "webextension-polyfill";
import { parseJobFromPageOrFetch } from "./parseJobFromPage";

browser.runtime.onMessage.addListener((message: unknown) => {
  const msg = message as { type?: string };
  if (msg?.type === "PARSE_JOB_REQUEST") {
    return parseJobFromPageOrFetch(document, window.location.href);
  }
  return undefined;
});
