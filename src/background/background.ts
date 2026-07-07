import browser from "webextension-polyfill";
import { handleMessage, type BackgroundMessage } from "./messageHandler";
import { callClaudeApi } from "../lib/anthropicClient";

browser.runtime.onMessage.addListener((message: unknown) => {
  return handleMessage(message as BackgroundMessage, callClaudeApi);
});
