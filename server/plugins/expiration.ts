import { definePlugin } from "nitro";
import { enforceExpirations } from "../lib/expiration";
import { getActiveTokens } from "../lib/session";

export default definePlugin((nitroApp) => {
  const timer = setInterval(async () => {
    const token = getActiveTokens()[0];
    if (token) {
      try {
        await enforceExpirations(token);
      } catch {
        // A failed Emby check is retried on the next interval.
      }
    }
  }, 60_000);
  timer.unref?.();
  nitroApp.hooks.hook("close", () => clearInterval(timer));
});
