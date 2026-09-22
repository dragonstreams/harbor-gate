import { randomUUID } from "node:crypto";
import { defineHandler } from "nitro";
import { createError, readBody, setResponseStatus } from "nitro/h3";
import { deployBunnyInstance, getBunnyConfigurationStatus } from "../../lib/bunny";
import { encryptCredentials, validatePublicServerUrl } from "../../lib/instance-security";
import { authenticateAt, normalizeMediaServerUrl } from "../../lib/media-server";
import { requireSession } from "../../lib/session";
import { readData, updateData } from "../../lib/store";
import type { ServerId } from "../../lib/types";

function instanceSlug(name: string) {
  return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 42);
}

function safeDeploymentError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unable to deploy HarborGate instance";
  return message
    .replace(/github_pat_[A-Za-z0-9_]+/gi, "[REDACTED_GITHUB_TOKEN]")
    .replace(/ghp_[A-Za-z0-9]+/gi, "[REDACTED_GITHUB_TOKEN]")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .slice(0, 600);
}

export default defineHandler(async (event) => {
  requireSession(event, true);
  if (process.env.HARBORGATE_MODE === "child") {
    throw createError({ statusCode: 404, statusMessage: "Instance management is not available on child deployments" });
  }
  const configuration = getBunnyConfigurationStatus();
  if (!configuration.ready) {
    throw createError({ statusCode: 503, statusMessage: `Master deployment is missing: ${configuration.missing.join(", ")}` });
  }

  const body = await readBody<{ name?: string; serverId?: ServerId; serverUrl?: string; username?: string; password?: string }>(event);
  const name = body?.name?.trim();
  const username = body?.username?.trim() ?? "";
  const password = body?.password ?? "";
  const isPlex = body?.serverId === "plex";
  const validCredentials = isPlex || (username.length > 0 && username.length <= 100 && password.length > 0 && password.length <= 300);
  const validAddress = isPlex || Boolean(body?.serverUrl);
  if (!name || name.length > 80 || !validCredentials || !validAddress || !body.serverId || !["emby", "jellyfin", "plex"].includes(body.serverId)) {
    throw createError({ statusCode: 400, statusMessage: "Enter a name, server address, and valid administrator credentials" });
  }
  const slug = instanceSlug(name);
  if (slug.length < 3) throw createError({ statusCode: 400, statusMessage: "Instance name must contain at least three letters or numbers" });

  const existing = await readData();
  if (existing.instances.some((instance) => instance.slug === slug)) {
    throw createError({ statusCode: 409, statusMessage: "An instance with this name already exists" });
  }

  let stage = "validating the media server address";
  try {
    const validatedServerUrl = isPlex ? "" : await validatePublicServerUrl(body.serverUrl!);
    const serverUrl = isPlex ? "" : normalizeMediaServerUrl(body.serverId, validatedServerUrl);
    stage = "authenticating the media server administrator";
    const authenticated = body.serverId === "plex" ? null : await authenticateAt(body.serverId, serverUrl, username, password);
    stage = "encrypting retained credentials";
    const encryptedCredentials = encryptCredentials(username, password);
    stage = "creating the Bunny application";
    const deployment = await deployBunnyInstance({
      name,
      slug,
      serverId: body.serverId,
      serverUrl,
      serverToken: authenticated?.AccessToken,
    });
    stage = "saving the deployed instance";
    const instance = {
      id: randomUUID(),
      name,
      slug,
      serverId: body.serverId,
      serverUrl,
      bunnyAppId: deployment.appId,
      publicUrl: deployment.publicUrl,
      bunnyHostname: deployment.bunnyHostname,
      createdAt: new Date().toISOString(),
      status: "active" as const,
      encryptedCredentials,
    };
    await updateData((data) => { data.instances.unshift(instance); });
    const { encryptedCredentials: _credentials, ...safeInstance } = instance;
    return { instance: safeInstance };
  } catch (error) {
    const message = `${stage}: ${safeDeploymentError(error)}`;
    console.error("HarborGate deployment failed:", message);
    setResponseStatus(event, 502);
    return { error: message };
  }
});
