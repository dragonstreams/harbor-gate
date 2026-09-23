import { randomUUID } from "node:crypto";
import { defineHandler } from "nitro";
import { createError, readBody } from "nitro/h3";
import { createUser, deleteUser, listFeatures, listLibraries, listUsers, setPolicy, setUserPassword, updateUser } from "../../lib/media-server";
import { enforceExpirations } from "../../lib/expiration";
import { invitePlexUser, listPlexLibraries, listPlexLibraryIds, listPlexShares, restorePlexShare, revokePlexShare } from "../../lib/plex";
import { requireSession } from "../../lib/session";
import { expirationKey, getExpiration, readData, updateData } from "../../lib/store";
import type { EmbyPolicy } from "../../lib/types";

type RequestBody = {
  operation?: "create" | "update" | "delete" | "notes" | "invite";
  id?: string;
  name?: string;
  username?: string;
  password?: string;
  maxSimultaneousStreams?: number;
  admin?: string;
  notes?: string;
  librarySectionIds?: number[];
  expiration?: string | null;
  policy?: EmbyPolicy;
};

function cleanExpiration(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw createError({ statusCode: 400, statusMessage: "Invalid expiration date" });
  return date.toISOString();
}

async function validateFolderPolicy(serverId: "emby" | "jellyfin", token: string, serverUrl: string, policy?: EmbyPolicy) {
  if (policy?.EnableAllFolders !== false) return { EnableAllFolders: true, EnabledFolders: [] as string[] };
  if (!Array.isArray(policy.EnabledFolders)) {
    throw createError({ statusCode: 400, statusMessage: "Choose at least one library" });
  }
  const selected = [...new Set(policy.EnabledFolders)];
  if (!selected.length || selected.some((id) => typeof id !== "string" || !id || id.length > 100)) {
    throw createError({ statusCode: 400, statusMessage: "Choose at least one library" });
  }
  const available = await listLibraries(serverId, token, serverUrl);
  const availableIds = new Set(available.map((library) => library.id));
  if (selected.some((id) => !availableIds.has(id))) {
    throw createError({ statusCode: 400, statusMessage: "One or more selected libraries are unavailable" });
  }
  return { EnableAllFolders: false, EnabledFolders: selected };
}

export default defineHandler(async (event) => {
  const session = requireSession(event, true);
  const { serverId, serverUrl, token } = session;
  const body = await readBody<RequestBody>(event);
  const name = body?.name?.trim();

  if (body?.operation === "notes") {
    if (!body.id || body.id.length > 80 || typeof body.notes !== "string" || body.notes.length > 100) {
      throw createError({ statusCode: 400, statusMessage: "Notes must be 100 characters or fewer" });
    }
    const scope = serverId === "plex" ? session.machineIdentifier : undefined;
    if (serverId === "plex") {
      if (!scope) throw createError({ statusCode: 400, statusMessage: "Plex server identity is missing" });
      const active = await listPlexShares(token, scope);
      const stored = await readData();
      if (!active.some((share) => share.invitedId === body.id) && !stored.plexShares[`${scope}:${body.id}`]) {
        throw createError({ statusCode: 404, statusMessage: "Plex shared user not found" });
      }
    } else {
      const users = await listUsers(serverId, token, serverUrl);
      if (!users.some((user) => user.Id === body.id)) throw createError({ statusCode: 404, statusMessage: "User profile not found" });
    }
    await updateData((data) => {
      const previous = getExpiration(data, serverId, body.id!, scope);
      data.expirations[expirationKey(serverId, body.id!, scope)] = {
        expiresAt: previous?.expiresAt ?? null,
        disabledByHarborGate: previous?.disabledByHarborGate ?? false,
        adminName: previous?.adminName,
        notes: body.notes!.trim(),
      };
    });
    return { ok: true };
  }

  if (serverId === "plex") {
    if (!session.machineIdentifier) throw createError({ statusCode: 400, statusMessage: "Plex server identity is missing" });
    const machineIdentifier = session.machineIdentifier;

    if (body?.operation === "invite") {
      const username = body.username?.trim() ?? "";
      const librarySectionIds = [...new Set(body.librarySectionIds ?? [])];
      if (!/^[A-Za-z0-9._-]{1,100}$/.test(username)) {
        throw createError({ statusCode: 400, statusMessage: "Enter a valid Plex username" });
      }
      if (!librarySectionIds.length || librarySectionIds.some((id) => !Number.isInteger(id) || id < 1)) {
        throw createError({ statusCode: 400, statusMessage: "Choose at least one Plex library" });
      }
      const availableLibraries = await listPlexLibraries(token, machineIdentifier);
      const availableIds = new Set(availableLibraries.map((library) => library.id));
      if (librarySectionIds.some((id) => !availableIds.has(id))) {
        throw createError({ statusCode: 400, statusMessage: "One or more selected Plex libraries are unavailable" });
      }
      const before = await listPlexShares(token, machineIdentifier);
      if (before.some((share) => share.name.toLowerCase() === username.toLowerCase())) {
        throw createError({ statusCode: 409, statusMessage: "That Plex username already has managed library access" });
      }
      const invitation = await invitePlexUser(token, machineIdentifier, username, librarySectionIds);
      const previousIds = new Set(before.map((share) => share.id));
      const invited = invitation ?? (await listPlexShares(token, machineIdentifier)).find((share) =>
        !previousIds.has(share.id) || share.name.toLowerCase() === username.toLowerCase());
      if (!invited) {
        throw createError({ statusCode: 502, statusMessage: "Plex accepted the invitation, but the new managed user is not visible yet" });
      }
      const expiration = cleanExpiration(body.expiration);
      await updateData((data) => {
        data.plexShares[`${machineIdentifier}:${invited.invitedId}`] = {
          machineIdentifier,
          invitedId: invited.invitedId,
          name: invited.name,
          email: invited.email,
          librarySectionIds,
          enabled: true,
        };
        if (expiration) {
          data.expirations[expirationKey(serverId, invited.invitedId, machineIdentifier)] = { expiresAt: expiration, disabledByHarborGate: false };
        }
      });
      return { ok: true };
    }

    if (body?.operation !== "update" || !body.id) {
      throw createError({ statusCode: 400, statusMessage: "Invalid Plex shared-user changes" });
    }
    const key = `${machineIdentifier}:${body.id}`;

    if (typeof body.policy?.IsDisabled !== "boolean") {
      if (!Object.prototype.hasOwnProperty.call(body, "expiration")) {
        throw createError({ statusCode: 400, statusMessage: "Enter a Plex expiration date" });
      }
      const expiration = cleanExpiration(body.expiration);
      const stored = await readData();
      const oldRecord = getExpiration(stored, serverId, body.id, machineIdentifier);
      const shouldReactivate = Boolean(oldRecord?.disabledByHarborGate && (!expiration || new Date(expiration).getTime() > Date.now()));
      if (shouldReactivate) {
        const share = stored.plexShares[key];
        if (!share) throw createError({ statusCode: 404, statusMessage: "The previous Plex library permissions were not found" });
        await restorePlexShare(token, machineIdentifier, share.invitedId, share.librarySectionIds);
      }
      await updateData((data) => {
        data.expirations[expirationKey(serverId, body.id!, machineIdentifier)] = { ...oldRecord, expiresAt: expiration, disabledByHarborGate: false };
        if (shouldReactivate) {
          data.plexShares[key] = { ...data.plexShares[key], enabled: true };
          data.events.unshift({ id: randomUUID(), serverId, serverScope: machineIdentifier, userId: body.id!, userName: name || stored.plexShares[key]?.name || "Plex user", occurredAt: new Date().toISOString(), action: "reactivated" });
        }
      });
      await enforceExpirations(serverId, token, serverUrl, machineIdentifier);
      return { ok: true };
    }

    const activeShares = await listPlexShares(token, machineIdentifier);
    const activeShare = activeShares.find((share) => share.invitedId === body.id);
    if (body.policy.IsDisabled) {
      if (!activeShare) return { ok: true };
      const librarySectionIds = activeShare.librarySectionIds.length
        ? activeShare.librarySectionIds
        : await listPlexLibraryIds(token, machineIdentifier);
      if (!librarySectionIds.length) throw createError({ statusCode: 502, statusMessage: "Plex did not return the libraries required to restore this share later" });
      await revokePlexShare(token, machineIdentifier, activeShare.id);
      await updateData((data) => {
        data.plexShares[key] = {
          machineIdentifier,
          invitedId: activeShare.invitedId,
          name: activeShare.name,
          email: activeShare.email,
          librarySectionIds,
          enabled: false,
        };
      });
    } else {
      if (activeShare) return { ok: true };
      const record = (await readData()).plexShares[key];
      if (!record) throw createError({ statusCode: 404, statusMessage: "The previous Plex share permissions were not found" });
      await restorePlexShare(token, machineIdentifier, record.invitedId, record.librarySectionIds);
      await updateData((data) => { data.plexShares[key] = { ...record, enabled: true }; });
    }
    return { ok: true };
  }

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
    const folderPolicy = await validateFolderPolicy(serverId, token, serverUrl, body.policy);
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
        ...folderPolicy,
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
    const streamLimit = body.maxSimultaneousStreams;
    if (streamLimit !== undefined && (!Number.isInteger(streamLimit) || streamLimit < 1 || streamLimit > 100)) {
      throw createError({ statusCode: 400, statusMessage: "Maximum simultaneous connections must be between 1 and 100" });
    }
    const expiration = cleanExpiration(body.expiration);
    const oldRecord = getExpiration(await readData(), serverId, user.Id);
    const adminName = body.admin === undefined ? oldRecord?.adminName ?? "" : body.admin.trim();
    if (adminName.length > 100) throw createError({ statusCode: 400, statusMessage: "Admin name is too long" });
    const shouldReactivate = Boolean(oldRecord?.disabledByHarborGate && expiration && new Date(expiration).getTime() > Date.now());
    const folderPolicy = await validateFolderPolicy(serverId, token, serverUrl, body.policy);
    const nextPolicy = {
      ...user.Policy,
      ...body.policy,
      ...folderPolicy,
      IsAdministrator: false,
      ...(streamLimit === undefined ? {} : serverId === "emby" ? { SimultaneousStreamLimit: streamLimit } : { MaxActiveSessions: streamLimit }),
    };
    if (shouldReactivate) nextPolicy.IsDisabled = false;
    await updateUser(serverId, token, user, name, nextPolicy, serverUrl);
    await updateData((data) => {
      data.expirations[expirationKey(serverId, user.Id)] = { ...oldRecord, expiresAt: expiration, disabledByHarborGate: false, adminName };
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
