import { defineHandler } from "nitro";

export default defineHandler(() => ({
  status: "ok",
  service: "harborgate",
  timestamp: new Date().toISOString(),
}));
