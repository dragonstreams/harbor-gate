import { randomUUID } from "node:crypto";
import { defineHandler } from "nitro";
import { createError, readBody } from "nitro/h3";
import { createUser, deleteUser, listFeatures, listUsers, setPolicy, setUserPassword, updateUser } from "../../lib/media-server";
import { enforceExpirations } from "../../lib/expiration";
import { requireSession } from "../../lib/session";
import { expirationKey, getExpiration, readData, updateData } from "../../lib/store";
import type { EmbyPolicy } from "../../lib/types";

type RequestBody = {
  operation?: "create" | "update" | "delete";
  id?: string;
  name?: string;
  password?: string;
  maxSimultaneousStreams?: number;
  admin?: string;
  expiration?: string | null;
  policy?: EmbyPolicy;
};

function cleanExpiration(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw createError({ statusCode: 400, statusMessage: "Invalid expiration date" });
  return date.toISOString();
}

export default defineHandler(async (event) => {
  const session = requireSession(event, true);
  const { serverId, serverUrl, token } = session;
  const body = await readBody<RequestBody>(event);
  const name = body?.name?.trim();

  if (body?.operation === "create") {
    if (!name || name.length > 100) throw createError({ statusCode: 400, statusMessage: "Enter a username" });
    const password = body.password ?? "";
    if (password.length < 4 || password.length > 200) throw createError({ statusCode: 400, statusMessage: "Password must be between 4 and 200 characters" });
    const streamLimit = body.maxSimultaneousStreams;
    if (!Number.isInteger(streamLimit) || streamLimit! < 1 || streamLimit! > 100) {
      throw createError({ statusCode: 400, statusMessage: "Maximum simultaneous streams must be between 1 and 100" });
    }
    const adminName = body.admin?.trim() ?? "";
    if (adminName.length > 100) throw createError({ statusCode: 400, statusMessage: "Admin name is too long" });
    const expiration = cleanExpiration(body.expiration);
    let traktFeatureIds: string[] = [];
    if (serverId === "emby") {
      const features = await listFeatures(serverId, token, serverUrl);
      traktFeatureIds = features
        .filter((feature) => `${feature.Name} ${feature.Id}`.toLowerCase().includes("trakt"))
        .map((feature) => feature.Id);
      if (traktFeatureIds.length === 0) {
        throw createError({ statusCode: 502, statusMessage: "The Emby server did not expose its Trakt feature ID" });
      }
    }
    const created = await createUser(serverId, token, name, password, serverUrl);
    try {
      if (serverId === "emby") await setUserPassword(serverId, token, created.Id, password, serverUrl);
      await setPolicy(serverId, token, created.Id, {
        ...created.Policy,
        IsAdministrator: false,
        IsDisabled: false,
        ...(serverId === "emby" ? { SimultaneousStreamLimit: streamLimit } : { MaxActiveSessions: streamLimit }),
        EnableContentDownloading: false,
        EnableSyncTranscoding: false,
        EnablePublicSharing: false,
        EnableLiveTvAccess: false,
        EnableLiveTvManagement: false,
        ...(traktFeatureIds.length ? { RestrictedFeatures: [...new Set([...(created.Policy?.RestrictedFeatures ?? []), ...traktFeatureIds])] } : {}),
      }, serverUrl);
      if (expiration || adminName) {
        await updateData((data) => {
          data.expirations[expirationKey(serverId, created.Id)] = { expiresAt: expiration, disabledByHarborGate: false, adminName };
        });
      }
      await enforceExpirations(serverId, token, serverUrl);
      return { ok: true };
    } catch (error) {
      await deleteUser(serverId, token, created.Id, serverUrl).catch(() => undefined);
      throw error;
    }
  }

  if (!body?.id || body.id.length > 80) throw createError({ statusCode: 400, statusMessage: "Invalid user profile" });
  const users = await listUsers(serverId, token, serverUrl);
  const user = users.find((candidate) => candidate.Id === body.id);
  if (!user) throw createError({ statusCode: 404, statusMessage: "User profile not found" });
  if (user.Policy?.IsAdministrator) throw createError({ statusCode: 403, statusMessage: "Administrator profiles cannot be changed here" });

  if (body.operation === "delete") {
    await deleteUser(serverId, token, user.Id, serverUrl);
    await updateData((data) => {
      delete data.expirations[expirationKey(serverId, user.Id)];
      if (serverId === "emby") delete data.expirations[user.Id];
    });
    return { ok: true };
  }

  if (body.operation === "update") {
    if (!name || name.length > 100 || !body.policy) throw createError({ statusCode: 400, statusMessage: "Invalid profile changes" });
    const expiration = cleanExpiration(body.expiration);
    const oldRecord = getExpiration(await readData(), serverId, user.Id);
    const adminName = body.admin === undefined ? oldRecord?.adminName ?? "" : body.admin.trim();
    if (adminName.length > 100) throw createError({ statusCode: 400, statusMessage: "Admin name is too long" });
    const shouldReactivate = Boolean(oldRecord?.disabledByHarborGate && expiration && new Date(expiration).getTime() > Date.now());
    const nextPolicy = { ...user.Policy, ...body.policy, IsAdministrator: false };
    if (shouldReactivate) nextPolicy.IsDisabled = false;
    await updateUser(serverId, token, user, name, nextPolicy, serverUrl);
    await updateData((data) => {
      data.expirations[expirationKey(serverId, user.Id)] = { expiresAt: expiration, disabledByHarborGate: false, adminName };
      if (serverId === "emby") delete data.expirations[user.Id];
      if (shouldReactivate) {
        data.events.unshift({ id: randomUUID(), serverId, userId: user.Id, userName: name, occurredAt: new Date().toISOString(), action: "reactivated" });
      }
    });
    await enforceExpirations(serverId, token, serverUrl);
    return { ok: true };
  }

  throw createError({ statusCode: 400, statusMessage: "Unsupported operation" });
});
