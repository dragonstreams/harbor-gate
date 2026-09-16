import { createError, defineHandler, readBody } from "../../_libs/h3+rou3+srvx.mjs";
import { authenticate } from "../../_chunks/emby.mjs";
import { createSession } from "../../index.mjs";
//#region server/routes/api/session.post.ts
var session_post_default = defineHandler(async (event) => {
	const body = await readBody(event);
	const username = body?.username?.trim();
	if (!username || !body?.password || username.length > 100 || body.password.length > 300) throw createError({
		statusCode: 400,
		statusMessage: "Enter valid Emby administrator credentials"
	});
	try {
		const auth = await authenticate(username, body.password);
		return createSession(event, auth.AccessToken, auth.User.Name);
	} catch (error) {
		throw createError({
			statusCode: 401,
			statusMessage: error instanceof Error ? error.message : "Unable to sign in to Emby"
		});
	}
});
//#endregion
export { session_post_default as default };
