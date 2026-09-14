import { definePlugin } from "nitro";
import { enforceExpirations } from "../lib/expiration";
import { getActiveTokens } from "../lib/session";

export default definePlugin((nitroApp) => {
  async function checkExpirations() {
    const serviceToken = process.env.HARBORGATE_EMBY_API_KEY?.trim();
    const token = serviceToken || getActiveTokens()[0];
    if (!token) return;
    try {
      await enforceExpirations(token);
    } catch {
      // Transient Emby failures are retried on the next interval.
    }
  }

  void checkExpirations();
  const timer = setInterval(checkExpirations, 60_000);
  timer.unref?.();
  nitroApp.hooks.hook("close", () => clearInterval(timer));
});
