import { createError, defineHandler, readBody } from "../../_libs/h3+rou3+srvx.mjs";
import { createUser, deleteUser, listFeatures, listUsers, setPolicy, setUserPassword, updateUser } from "../../_chunks/emby.mjs";
import { enforceExpirations, requireSession, updateData } from "../../index.mjs";
import { randomUUID } from "node:crypto";
//#region server/routes/api/users.post.ts
function cleanExpiration(value) {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) throw createError({
		statusCode: 400,
		statusMessage: "Invalid expiration date"
	});
	return date.toISOString();
}
var users_post_default = defineHandler(async (event) => {
	const session = requireSession(event, true);
	const body = await readBody(event);
	const name = body?.name?.trim();
	if (body?.operation === "create") {
		if (!name || name.length > 100) throw createError({
			statusCode: 400,
			statusMessage: "Enter a username"
		});
		const password = body.password ?? "";
		if (password.length < 4 || password.length > 200) throw createError({
			statusCode: 400,
			statusMessage: "Password must be between 4 and 200 characters"
		});
		const streamLimit = body.maxSimultaneousStreams;
		if (!Number.isInteger(streamLimit) || streamLimit < 1 || streamLimit > 100) throw createError({
			statusCode: 400,
			statusMessage: "Maximum simultaneous streams must be between 1 and 100"
		});
		const adminName = body.admin?.trim() ?? "";
		if (adminName.length > 100) throw createError({
			statusCode: 400,
			statusMessage: "Admin name is too long"
		});
		const expiration = cleanExpiration(body.expiration);
		const traktFeatureIds = (await listFeatures(session.token)).filter((feature) => `${feature.Name} ${feature.Id}`.toLowerCase().includes("trakt")).map((feature) => feature.Id);
		if (traktFeatureIds.length === 0) throw createError({
			statusCode: 502,
			statusMessage: "The Emby server did not expose its Trakt feature ID"
		});
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
				EnableLiveTvAccess: false,
				EnableLiveTvManagement: false,
				RestrictedFeatures: [...new Set([...created.Policy?.RestrictedFeatures ?? [], ...traktFeatureIds])]
			});
			if (expiration || adminName) await updateData((data) => {
				data.expirations[created.Id] = {
					expiresAt: expiration,
					disabledByHarborGate: false,
					adminName
				};
			});
			await enforceExpirations(session.token);
			return { ok: true };
		} catch (error) {
			await deleteUser(session.token, created.Id).catch(() => void 0);
			throw error;
		}
	}
	if (!body?.id || body.id.length > 80) throw createError({
		statusCode: 400,
		statusMessage: "Invalid user profile"
	});
	const user = (await listUsers(session.token)).find((candidate) => candidate.Id === body.id);
	if (!user) throw createError({
		statusCode: 404,
		statusMessage: "User profile not found"
	});
	if (user.Policy?.IsAdministrator) throw createError({
		statusCode: 403,
		statusMessage: "Administrator profiles cannot be changed here"
	});
	if (body.operation === "delete") {
		await deleteUser(session.token, user.Id);
		await updateData((data) => {
			delete data.expirations[user.Id];
		});
		return { ok: true };
	}
	if (body.operation === "update") {
		if (!name || name.length > 100 || !body.policy) throw createError({
			statusCode: 400,
			statusMessage: "Invalid profile changes"
		});
		const expiration = cleanExpiration(body.expiration);
		const oldRecord = (await updateData(() => void 0)).expirations[user.Id];
		const adminName = body.admin === void 0 ? oldRecord?.adminName ?? "" : body.admin.trim();
		if (adminName.length > 100) throw createError({
			statusCode: 400,
			statusMessage: "Admin name is too long"
		});
		const shouldReactivate = Boolean(oldRecord?.disabledByHarborGate && expiration && new Date(expiration).getTime() > Date.now());
		const nextPolicy = {
			...user.Policy,
			...body.policy,
			IsAdministrator: false
		};
		if (shouldReactivate) nextPolicy.IsDisabled = false;
		await updateUser(session.token, user, name, nextPolicy);
		await updateData((data) => {
			data.expirations[user.Id] = {
				expiresAt: expiration,
				disabledByHarborGate: false,
				adminName
			};
			if (shouldReactivate) data.events.unshift({
				id: randomUUID(),
				userId: user.Id,
				userName: name,
				occurredAt: (/* @__PURE__ */ new Date()).toISOString(),
				action: "reactivated"
			});
		});
		await enforceExpirations(session.token);
		return { ok: true };
	}
	throw createError({
		statusCode: 400,
		statusMessage: "Unsupported operation"
	});
});
//#endregion
export { users_post_default as default };
