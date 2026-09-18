import { defineHandler } from "nitro";
import { createError } from "nitro/h3";
import { getBunnyConfigurationStatus } from "../../lib/bunny";
import { requireSession } from "../../lib/session";
import { readData } from "../../lib/store";

export default defineHandler(async (event) => {
  requireSession(event);
  if (process.env.HARBORGATE_MODE === "child") {
    throw createError({ statusCode: 404, statusMessage: "Instance management is not available on child deployments" });
  }
  const data = await readData();
  return {
    configuration: getBunnyConfigurationStatus(),
    instances: data.instances.map(({ encryptedCredentials: _credentials, ...instance }) => instance),
  };
});
