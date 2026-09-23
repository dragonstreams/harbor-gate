import { defineHandler } from "nitro";
import { createError, getQuery } from "nitro/h3";
import { searchPlexUsers } from "../../../lib/plex";
import { requireSession } from "../../../lib/session";

export default defineHandler(async (event) => {
  const session = requireSession(event);
  if (session.serverId !== "plex") {
    throw createError({ statusCode: 400, statusMessage: "Plex authentication is required" });
  }
  const query = String(getQuery(event).q ?? "").trim();
  if (!/^[A-Za-z0-9._-]{2,100}$/.test(query)) return { users: [] };
  return { users: await searchPlexUsers(session.token, query) };
});
