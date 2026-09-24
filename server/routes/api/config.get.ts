import { defineHandler } from "nitro";
import { setResponseHeader } from "nitro/h3";
import { CONFIGURED_CHILD_SERVER, MEDIA_SERVERS } from "../../lib/media-server";

export default defineHandler((event) => {
  setResponseHeader(event, "Cache-Control", "no-store, max-age=0");
  return {
    mode: process.env.HARBORGATE_MODE === "child" ? "child" : "master",
    serverId: CONFIGURED_CHILD_SERVER,
    serverLabel: CONFIGURED_CHILD_SERVER ? MEDIA_SERVERS[CONFIGURED_CHILD_SERVER].label : null,
    serverHostname: CONFIGURED_CHILD_SERVER ? MEDIA_SERVERS[CONFIGURED_CHILD_SERVER].hostname : null,
    serverUrl: CONFIGURED_CHILD_SERVER ? MEDIA_SERVERS[CONFIGURED_CHILD_SERVER].url : null,
  };
});
