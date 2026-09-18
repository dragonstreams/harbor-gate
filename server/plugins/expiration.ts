import { definePlugin } from "nitro";
import { enforceExpirations } from "../lib/expiration";
import { getActiveConnections } from "../lib/session";
import type { ServerId } from "../lib/types";

export default definePlugin((nitroApp) => {
  async function checkExpirations() {
    const connections = new Map<ServerId, string>(getActiveConnections().map(({ serverId, token }) => [serverId, token]));
    const embyKey = process.env.HARBORGATE_EMBY_API_KEY?.trim();
    const jellyfinKey = process.env.HARBORGATE_JELLYFIN_API_KEY?.trim();
    if (embyKey) connections.set("emby", embyKey);
    if (jellyfinKey) connections.set("jellyfin", jellyfinKey);
    await Promise.all([...connections].map(async ([serverId, token]) => {
      try {
        await enforceExpirations(serverId, token);
      } catch {
        // Transient media-server failures are retried on the next interval.
      }
    }));
  }

  void checkExpirations();
  const timer = setInterval(checkExpirations, 60_000);
  timer.unref?.();
  nitroApp.hooks.hook("close", () => clearInterval(timer));
});
