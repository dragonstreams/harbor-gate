import { defineHandler } from "nitro";
import { CONFIGURED_CHILD_SERVER, MEDIA_SERVERS } from "../../lib/media-server";

export default defineHandler(() => ({
  mode: process.env.HARBORGATE_MODE === "child" ? "child" : "master",
  serverId: CONFIGURED_CHILD_SERVER,
  serverLabel: CONFIGURED_CHILD_SERVER ? MEDIA_SERVERS[CONFIGURED_CHILD_SERVER].label : null,
  serverHostname: CONFIGURED_CHILD_SERVER ? MEDIA_SERVERS[CONFIGURED_CHILD_SERVER].hostname : null,
}));
