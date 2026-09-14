import { randomUUID } from "node:crypto";
import { defineHandler } from "nitro";
import { createError, readBody } from "nitro/h3";
import { createUser, deleteUser, listUsers, setPolicy, updateUser } from "../../lib/emby";
import { enforceExpirations } from "../../lib/expiration";
import { requireSession } from "../../lib/session";
import { updateData } from "../../lib/store";
import type { EmbyPolicy } from "../../lib/types";

type RequestBody = {
  operation?: "create" | "update" | "delete";
  id?: string;
  name?: string;
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
    if (!name || name.length > 100) throw createError({ statusCode: 400, statusMessage: "Enter a profile name" });
    const adminName = body.admin?.trim() ?? "";
    if (adminName.length > 100) throw createError({ statusCode: 400, statusMessage: "Admin name is too long" });
    const created = await createUser(session.token, name);
    const expiration = cleanExpiration(body.expiration);
    if (expiration || adminName) {
      await updateData((data) => {
        data.expirations[created.Id] = { expiresAt: expiration, disabledByHarborGate: false, adminName };
      });
    }
    await enforceExpirations(session.token);
    return { ok: true };
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
