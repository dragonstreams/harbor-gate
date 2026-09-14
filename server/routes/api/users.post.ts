import { randomUUID } from "node:crypto";
import { defineHandler } from "nitro";
import { createError, readBody } from "nitro/h3";
import { createUser, deleteUser, listUsers, setPolicy, setUserPassword, updateUser } from "../../lib/emby";
import { enforceExpirations } from "../../lib/expiration";
import { requireSession } from "../../lib/session";
import { updateData } from "../../lib/store";
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
    const created = await createUser(session.token, name);
    try {
      await setUserPassword(session.token, created.Id, password);
      await setPolicy(session.token, created.Id, {
        ...created.Policy,
        IsAdministrator: false,
        IsDisabled: false,
        SimultaneousStreamLimit: streamLimit,
        EnableContentDownloading: false,
        EnableSyncTranscoding: false,
        EnablePublicSharing: false,
      });
      if (expiration || adminName) {
        await updateData((data) => {
          data.expirations[created.Id] = { expiresAt: expiration, disabledByHarborGate: false, adminName };
        });
      }
      await enforceExpirations(session.token);
      return { ok: true };
    } catch (error) {
      await deleteUser(session.token, created.Id).catch(() => undefined);
      throw error;
    }
  }

  if (!body?.id || body.id.length > 80) throw createError({ statusCode: 400, statusMessage: "Invalid user profile" });
  const users = await listUsers(session.token);
  const user = users.find((candidate) => candidate.Id === body.id);
  if (!user) throw createError({ statusCode: 404, statusMessage: "User profile not found" });
  if (user.Policy?.IsAdministrator) throw createError({ statusCode: 403, statusMessage: "Administrator profiles cannot be changed here" });

  if (body.operation === "delete") {
    await deleteUser(session.token, user.Id);
    await updateData((data) => { delete data.expirations[user.Id]; });
    return { ok: true };
  }

  if (body.operation === "update") {
    if (!name || name.length > 100 || !body.policy) throw createError({ statusCode: 400, statusMessage: "Invalid profile changes" });
    const expiration = cleanExpiration(body.expiration);
    const oldData = await updateData(() => undefined);
    const oldRecord = oldData.expirations[user.Id];
    const adminName = body.admin === undefined ? oldRecord?.adminName ?? "" : body.admin.trim();
    if (adminName.length > 100) throw createError({ statusCode: 400, statusMessage: "Admin name is too long" });
    const shouldReactivate = Boolean(oldRecord?.disabledByHarborGate && expiration && new Date(expiration).getTime() > Date.now());
    const nextPolicy = { ...user.Policy, ...body.policy, IsAdministrator: false };
    if (shouldReactivate) nextPolicy.IsDisabled = false;
    await updateUser(session.token, user, name, nextPolicy);
    await updateData((data) => {
      data.expirations[user.Id] = { expiresAt: expiration, disabledByHarborGate: false, adminName };
      if (shouldReactivate) {
        data.events.unshift({ id: randomUUID(), userId: user.Id, userName: name, occurredAt: new Date().toISOString(), action: "reactivated" });
      }
    });
    await enforceExpirations(session.token);
    return { ok: true };
  }

  throw createError({ statusCode: 400, statusMessage: "Unsupported operation" });
});
