import { defineHandler } from "../../_libs/h3+rou3+srvx.mjs";
import { listUsers } from "../../_chunks/emby.mjs";
import { enforceExpirations, readData, requireSession } from "../../index.mjs";
//#region server/routes/api/dashboard.get.ts
var dashboard_get_default = defineHandler(async (event) => {
	const session = requireSession(event);
	await enforceExpirations(session.token);
	const [users, data] = await Promise.all([listUsers(session.token), readData()]);
	return {
		adminName: session.adminName,
		csrf: session.csrf,
		users: users.map((user) => ({
			...user,
			expiration: data.expirations[user.Id]?.expiresAt ?? null,
			admin: data.expirations[user.Id]?.adminName ?? ""
		})),
		events: data.events
	};
});
//#endregion
export { dashboard_get_default as default };
