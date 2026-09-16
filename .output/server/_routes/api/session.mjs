import { defineHandler } from "../../_libs/h3+rou3+srvx.mjs";
import { removeSession, requireSession } from "../../index.mjs";
//#region server/routes/api/session.delete.ts
var session_delete_default = defineHandler((event) => {
	requireSession(event, true);
	removeSession(event);
	return { ok: true };
});
//#endregion
export { session_delete_default as default };
