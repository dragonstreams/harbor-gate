import { definePlugin } from "nitro";
import { enforceExpirations } from "../lib/expiration";
import { MEDIA_SERVERS } from "../lib/media-server";
import { getActiveConnections } from "../lib/session";

export default definePlugin((nitroApp) => {
  async function checkExpirations() {
    const connections = getActiveConnections();
    const embyKey = process.env.HARBORGATE_EMBY_API_KEY?.trim();
    const jellyfinKey = process.env.HARBORGATE_JELLYFIN_API_KEY?.trim();
    if (embyKey) connections.push({ serverId: "emby", serverUrl: MEDIA_SERVERS.emby.url, token: embyKey });
    if (jellyfinKey) connections.push({ serverId: "jellyfin", serverUrl: MEDIA_SERVERS.jellyfin.url, token: jellyfinKey });
    await Promise.all(connections.map(async ({ serverId, serverUrl, token }) => {
      try {
        await enforceExpirations(serverId, token, serverUrl);
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
