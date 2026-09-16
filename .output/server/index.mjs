globalThis.__nitro_main__ = import.meta.url;
import { H3Core, HTTPError, NodeResponse, composeMiddleware, createError, createMatcherFromFind, defineHandler, defineLazyEventHandler, deleteCookie, getCookie, getHeader, headers, memoizeRouteRulesMatcher, serve, setCookie, toEventHandler } from "./_libs/h3+rou3+srvx.mjs";
import { HookableCore } from "./_libs/hookable.mjs";
import { decodePath, joinURL, withLeadingSlash, withoutTrailingSlash } from "./_libs/ufo.mjs";
import { listUsers, setPolicy } from "./_chunks/emby.mjs";
import { promises } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
//#region #nitro/virtual/public-assets-data
var public_assets_data_default = {
	"/placeholder.svg": {
		"type": "image/svg+xml",
		"etag": "\"cb5-3cfZ/x0uNhX4kurZGAkOBE4K/G0\"",
		"mtime": "2026-09-14T03:19:03.694Z",
		"size": 3253,
		"path": "../public/placeholder.svg"
	},
	"/robots.txt": {
		"type": "text/plain; charset=utf-8",
		"etag": "\"a0-CKGXSIe7TSsqDTmGm/nY1t/o5d0\"",
		"mtime": "2026-09-14T03:19:03.694Z",
		"size": 160,
		"path": "../public/robots.txt"
	},
	"/favicon.ico": {
		"type": "image/vnd.microsoft.icon",
		"etag": "\"15f09-4MFHRo4azA6knOGNmsefGO+QUAE\"",
		"mtime": "2026-09-14T03:19:03.695Z",
		"size": 89865,
		"path": "../public/favicon.ico"
	},
	"/assets/index-B0Nlmq3o.css": {
		"type": "text/css; charset=utf-8",
		"etag": "\"10610-3c7+ziAZ/O9h/eVXGbYdtG7v/y4\"",
		"mtime": "2026-09-14T03:19:03.646Z",
		"size": 67088,
		"path": "../public/assets/index-B0Nlmq3o.css"
	},
	"/assets/index-Ds6eRMI_.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"704ea-H7ZaXy31/ikgmME5V+J5WzkcpHg\"",
		"mtime": "2026-09-14T03:19:03.645Z",
		"size": 460010,
		"path": "../public/assets/index-Ds6eRMI_.js"
	},
	"/assets/harborgate-empty.png": {
		"type": "image/png",
		"etag": "\"d6002-myfPuvfgan3mXVwpBU8lUJofdOE\"",
		"mtime": "2026-09-14T03:19:03.746Z",
		"size": 876546,
		"path": "../public/assets/harborgate-empty.png"
	},
	"/assets/harborgate-login-bg.png": {
		"type": "image/png",
		"etag": "\"9db49-qVZ7/WxU4Jilh7QVAnHEMvzdUlk\"",
		"mtime": "2026-09-14T03:19:03.695Z",
		"size": 645961,
		"path": "../public/assets/harborgate-login-bg.png"
	},
	"/assets/harborgate-logo.png": {
		"type": "image/png",
		"etag": "\"9e347-nvtxpkde1smeYAI4RjmmkyUd7X8\"",
		"mtime": "2026-09-14T03:19:03.695Z",
		"size": 648007,
		"path": "../public/assets/harborgate-logo.png"
	}
};
//#endregion
//#region #nitro/virtual/public-assets-node
function readAsset(id) {
	const serverDir = dirname(fileURLToPath(globalThis.__nitro_main__));
	return promises.readFile(resolve(serverDir, public_assets_data_default[id].path));
}
//#endregion
//#region #nitro/virtual/public-assets
var publicAssetBases = {};
function isPublicAssetURL(id = "") {
	if (public_assets_data_default[id]) return true;
	for (const base in publicAssetBases) if (id.startsWith(base)) return true;
	return false;
}
function getAsset(id) {
	return public_assets_data_default[id];
}
//#endregion
//#region node_modules/.pnpm/nitro@3.0.260903-beta/node_modules/nitro/dist/runtime/internal/static.mjs
var METHODS = new Set(["HEAD", "GET"]);
var EncodingMap = {
	gzip: ".gz",
	br: ".br",
	zstd: ".zst"
};
var static_default = defineHandler((event) => {
	if (event.req.method && !METHODS.has(event.req.method)) return;
	let id = decodePath(withLeadingSlash(withoutTrailingSlash(event.url.pathname)));
	let asset;
	const encodings = [...(event.req.headers.get("accept-encoding") || "").split(",").map((e) => EncodingMap[e.trim()]).filter(Boolean).sort(), ""];
	for (const encoding of encodings) for (const _id of [id + encoding, joinURL(id, "index.html" + encoding)]) {
		const _asset = getAsset(_id);
		if (_asset) {
			asset = _asset;
			id = _id;
			break;
		}
	}
	if (!asset) {
		if (isPublicAssetURL(id)) {
			event.res.headers.delete("Cache-Control");
			throw new HTTPError({ status: 404 });
		}
		return;
	}
	if (encodings.length > 1) event.res.headers.append("Vary", "Accept-Encoding");
	if (event.req.headers.get("if-none-match") === asset.etag) {
		event.res.status = 304;
		event.res.statusText = "Not Modified";
		return "";
	}
	const ifModifiedSinceH = event.req.headers.get("if-modified-since");
	const mtimeDate = new Date(asset.mtime);
	if (ifModifiedSinceH && asset.mtime && new Date(ifModifiedSinceH) >= mtimeDate) {
		event.res.status = 304;
		event.res.statusText = "Not Modified";
		return "";
	}
	if (asset.type) event.res.headers.set("Content-Type", asset.type);
	if (asset.etag && !event.res.headers.has("ETag")) event.res.headers.set("ETag", asset.etag);
	if (asset.mtime && !event.res.headers.has("Last-Modified")) event.res.headers.set("Last-Modified", mtimeDate.toUTCString());
	if (asset.encoding && !event.res.headers.has("Content-Encoding")) event.res.headers.set("Content-Encoding", asset.encoding);
	if (asset.size > 0 && !event.res.headers.has("Content-Length")) event.res.headers.set("Content-Length", asset.size.toString());
	return readAsset(id);
});
//#endregion
//#region #nitro/virtual/routing
var findRouteRules = /* @__PURE__ */ (() => {
	const $0 = {
		route: "/assets/**",
		rank: 0,
		rules: [{
			name: "headers",
			route: "/assets/**",
			handler: headers,
			options: { "cache-control": "public, max-age=31536000, immutable" }
		}]
	};
	return (m, p) => {
		let r = [];
		if (p.charCodeAt(p.length - 1) === 47) p = p.slice(0, -1);
		let s = p.split("/");
		if (s.length > 1 && s[s.length - 1] === "") {
			s.pop();
			p = p.slice(0, -1);
		}
		if (s.length > 1) {
			if (s[1] === "assets") r.push({
				data: $0,
				params: { "_": p.slice(8) }
			});
		}
		return r.reverse();
	};
})();
var _lazy_acc304936fe95c1d = defineLazyEventHandler(() => import("./_routes/api/dashboard.mjs"));
var _lazy_3be1b6d1d115dc01 = defineLazyEventHandler(() => import("./_routes/api/health.mjs"));
var _lazy_5cd9639a5e8e0b49 = defineLazyEventHandler(() => import("./_routes/api/session.mjs"));
var _lazy_f1370b0d5c73210e = defineLazyEventHandler(() => import("./_routes/api/session2.mjs"));
var _lazy_ba48b4af9c74f167 = defineLazyEventHandler(() => import("./_routes/api/users.mjs"));
var _lazy_4c674d7f48f7c2c8 = defineLazyEventHandler(() => import("./_chunks/renderer-template.mjs"));
var findRoute = /* @__PURE__ */ (() => {
	const $0 = {
		route: "/api/dashboard",
		method: "get",
		handler: _lazy_acc304936fe95c1d
	}, $1 = {
		route: "/api/health",
		method: "get",
		handler: _lazy_3be1b6d1d115dc01
	}, $2 = {
		route: "/api/session",
		method: "delete",
		handler: _lazy_5cd9639a5e8e0b49
	}, $3 = {
		route: "/api/session",
		method: "post",
		handler: _lazy_f1370b0d5c73210e
	}, $4 = {
		route: "/api/users",
		method: "post",
		handler: _lazy_ba48b4af9c74f167
	}, $5 = {
		route: "/**",
		handler: _lazy_4c674d7f48f7c2c8
	};
	return (m, p) => {
		if (p.charCodeAt(p.length - 1) === 47) p = p.slice(0, -1);
		if (p === "/api/dashboard") {
			if (m === "GET") return { data: $0 };
		} else if (p === "/api/health") {
			if (m === "GET") return { data: $1 };
		} else if (p === "/api/session") {
			if (m === "DELETE") return { data: $2 };
			else if (m === "POST") return { data: $3 };
		} else if (p === "/api/users") {
			if (m === "POST") return { data: $4 };
		} else if (p.charCodeAt(p.length - 1) === 47) {
			if (p === "/api/dashboard/") {
				if (m === "GET") return { data: $0 };
			} else if (p === "/api/health/") {
				if (m === "GET") return { data: $1 };
			} else if (p === "/api/session/") {
				if (m === "DELETE") return { data: $2 };
				else if (m === "POST") return { data: $3 };
			} else if (p === "/api/users/") {
				if (m === "POST") return { data: $4 };
			}
		}
		let s = p.split("/");
		if (s.length > 1 && s[s.length - 1] === "") {
			s.pop();
			p = p.slice(0, -1);
		}
		s.length;
		return {
			data: $5,
			params: { "_": p.slice(1) }
		};
	};
})();
var globalMiddleware = [toEventHandler(static_default)].filter(Boolean);
//#endregion
//#region node_modules/.pnpm/nitro@3.0.260903-beta/node_modules/nitro/dist/runtime/internal/error/prod.mjs
var errorHandler = (error, event) => {
	const res = defaultHandler(error, event);
	return new NodeResponse(typeof res.body === "string" ? res.body : JSON.stringify(res.body, null, 2), res);
};
function defaultHandler(error, event) {
	const unhandled = error.unhandled ?? !HTTPError.isError(error);
	const { status = 500, statusText = "" } = unhandled ? {} : error;
	if (status === 404) {
		const url = event.url || new URL(event.req.url);
		const baseURL = "/";
		if (/^\/[^/]/.test(baseURL) && !url.pathname.startsWith(baseURL)) return {
			status: 302,
			headers: new Headers({ location: `${baseURL}${url.pathname.slice(1)}${url.search}` })
		};
	}
	const headers = new Headers(unhandled ? {} : error.headers);
	headers.set("content-type", "application/json; charset=utf-8");
	return {
		status,
		statusText,
		headers,
		body: {
			error: true,
			...unhandled ? {
				status,
				unhandled: true
			} : typeof error.toJSON === "function" ? error.toJSON() : {
				status,
				statusText,
				message: error.message
			}
		}
	};
}
//#endregion
//#region #nitro/virtual/error-handler
var errorHandlers = [errorHandler];
async function error_handler_default(error, event) {
	for (const handler of errorHandlers) try {
		const response = await handler(error, event, { defaultHandler });
		if (response) return response;
	} catch (error) {
		console.error(error);
	}
}
//#endregion
//#region node_modules/.pnpm/nitro@3.0.260903-beta/node_modules/nitro/dist/runtime/internal/plugin.mjs
function defineNitroPlugin(def) {
	return def;
}
//#endregion
//#region server/lib/store.ts
var DATA_PATH = resolve(process.env.HARBORGATE_DATA_DIR?.trim() || resolve(process.cwd(), ".harborgate"), "data.json");
var EMPTY_DATA = {
	expirations: {},
	events: []
};
var writeQueue = Promise.resolve();
async function readData() {
	try {
		const stored = JSON.parse(await readFile(DATA_PATH, "utf8"));
		return {
			expirations: stored.expirations ?? {},
			events: Array.isArray(stored.events) ? stored.events : []
		};
	} catch {
		return {
			expirations: {},
			events: []
		};
	}
}
async function updateData(change) {
	let result = EMPTY_DATA;
	writeQueue = writeQueue.then(async () => {
		const data = await readData();
		change(data);
		data.events = data.events.slice(0, 100);
		await mkdir(dirname(DATA_PATH), { recursive: true });
		const temporaryPath = `${DATA_PATH}.tmp`;
		await writeFile(temporaryPath, JSON.stringify(data, null, 2), { mode: 384 });
		await rename(temporaryPath, DATA_PATH);
		result = data;
	});
	await writeQueue;
	return result;
}
//#endregion
//#region server/lib/expiration.ts
var running = false;
async function enforceExpirations(token) {
	if (running) return;
	running = true;
	try {
		const [data, users] = await Promise.all([readData(), listUsers(token)]);
		const now = Date.now();
		for (const user of users) {
			const record = data.expirations[user.Id];
			if (!record?.expiresAt) continue;
			if (new Date(record.expiresAt).getTime() <= now && !user.Policy?.IsDisabled) {
				await setPolicy(token, user.Id, {
					...user.Policy,
					IsDisabled: true
				});
				await updateData((next) => {
					next.expirations[user.Id] = {
						...record,
						disabledByHarborGate: true
					};
					next.events.unshift({
						id: randomUUID(),
						userId: user.Id,
						userName: user.Name,
						occurredAt: (/* @__PURE__ */ new Date()).toISOString(),
						action: "expired"
					});
				});
			}
		}
	} finally {
		running = false;
	}
}
//#endregion
//#region server/lib/session.ts
var COOKIE_NAME = "harborgate_session";
var SESSION_TTL = 720 * 60 * 1e3;
var sessions = /* @__PURE__ */ new Map();
function secureCookie(event) {
	getHeader(event, "x-forwarded-proto")?.split(",")[0]?.trim();
	return true;
}
function createSession(event, token, adminName) {
	const id = randomBytes(32).toString("hex");
	const csrf = randomBytes(24).toString("base64url");
	sessions.set(id, {
		token,
		adminName,
		csrf,
		expiresAt: Date.now() + SESSION_TTL
	});
	setCookie(event, COOKIE_NAME, id, {
		httpOnly: true,
		sameSite: "strict",
		secure: secureCookie(event),
		path: "/",
		maxAge: SESSION_TTL / 1e3
	});
	return {
		adminName,
		csrf
	};
}
function requireSession(event, mutation = false) {
	const id = getCookie(event, COOKIE_NAME);
	const session = id ? sessions.get(id) : void 0;
	if (!session || session.expiresAt < Date.now()) {
		if (id) sessions.delete(id);
		throw createError({
			statusCode: 401,
			statusMessage: "Your administrator session has expired"
		});
	}
	if (mutation && event.headers.get("x-harborgate-csrf") !== session.csrf) throw createError({
		statusCode: 403,
		statusMessage: "Invalid security token"
	});
	return session;
}
function removeSession(event) {
	const id = getCookie(event, COOKIE_NAME);
	if (id) sessions.delete(id);
	deleteCookie(event, COOKIE_NAME, { path: "/" });
}
function getActiveTokens() {
	const now = Date.now();
	const tokens = /* @__PURE__ */ new Set();
	for (const [id, session] of sessions) if (session.expiresAt < now) sessions.delete(id);
	else tokens.add(session.token);
	return [...tokens];
}
//#endregion
//#region #nitro/virtual/plugins
var plugins = [defineNitroPlugin((nitroApp) => {
	async function checkExpirations() {
		const token = process.env.HARBORGATE_EMBY_API_KEY?.trim() || getActiveTokens()[0];
		if (!token) return;
		try {
			await enforceExpirations(token);
		} catch {}
	}
	checkExpirations();
	const timer = setInterval(checkExpirations, 6e4);
	timer.unref?.();
	nitroApp.hooks.hook("close", () => clearInterval(timer));
}), defineNitroPlugin((nitroApp) => {
	nitroApp.hooks.hook("response", (response) => {
		response.headers.set("X-Content-Type-Options", "nosniff");
		response.headers.set("X-Frame-Options", "DENY");
		response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
		response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
		response.headers.set("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
	});
})];
//#endregion
//#region #nitro/virtual/app
function createNitroApp() {
	const hooks = new HookableCore();
	const captureError = (error, errorCtx) => {
		const promise = hooks.callHook("error", error, errorCtx)?.catch?.((hookError) => {
			console.error("Error while capturing another error", hookError);
		});
		if (errorCtx?.event) {
			const errors = errorCtx.event.req.context?.nitro?.errors;
			if (errors) errors.push({
				error,
				context: errorCtx
			});
			if (promise && typeof errorCtx.event.req.waitUntil === "function") errorCtx.event.req.waitUntil(promise);
		}
	};
	const h3App = createH3App({ onError(error, event) {
		captureError(error, { event });
		return error_handler_default(error, event);
	} });
	h3App.config.onRequest = (event) => {
		return hooks.callHook("request", event)?.catch?.((error) => {
			captureError(error, {
				event,
				tags: ["request"]
			});
		});
	};
	h3App.config.onResponse = (res, event) => {
		return hooks.callHook("response", res, event)?.catch?.((error) => {
			captureError(error, {
				event,
				tags: ["response"]
			});
		});
	};
	let appHandler = (req) => {
		req.context ||= {};
		req.context.nitro = req.context.nitro || { errors: [] };
		return h3App.fetch(req);
	};
	return {
		fetch: appHandler,
		h3: h3App,
		hooks,
		captureError
	};
}
function initNitroPlugins(app) {
	for (const plugin of plugins) try {
		plugin(app);
	} catch (error) {
		app.captureError?.(error, { tags: ["plugin"] });
		throw error;
	}
	app.h3["~dispatch"] = app.h3["~composed"] = void 0;
	return app;
}
function createH3App(config) {
	const h3App = new H3Core(config);
	h3App["~findRoute"] = (event) => {
		event.context.routeRules = getRouteRules(event.req.method, event.url.pathname).routeRules;
		return findRoute(event.req.method, event.url.pathname);
	};
	h3App["~middleware"].push(createRouteRulesMiddleware());
	h3App["~middleware"].push(...globalMiddleware);
	return h3App;
}
//#endregion
//#region node_modules/.pnpm/nitro@3.0.260903-beta/node_modules/nitro/dist/runtime/internal/app.mjs
var APP_ID = "default";
function useNitroApp() {
	let instance = useNitroApp._instance;
	if (instance) return instance;
	instance = useNitroApp._instance = createNitroApp();
	globalThis.__nitro__ = globalThis.__nitro__ || {};
	globalThis.__nitro__[APP_ID] = instance;
	initNitroPlugins(instance);
	return instance;
}
function useNitroHooks() {
	const nitroApp = useNitroApp();
	const hooks = nitroApp.hooks;
	if (hooks) return hooks;
	return nitroApp.hooks = new HookableCore();
}
var _matchRouteRules;
function getRouteRules(method, pathname) {
	return (_matchRouteRules ??= memoizeRouteRulesMatcher(createMatcherFromFind(findRouteRules)))(method, pathname);
}
function createRouteRulesMiddleware() {
	const composed = /* @__PURE__ */ new WeakMap();
	const middleware = (event, next) => {
		const ruleMiddleware = getRouteRules(event.req.method, event.url.pathname).routeRuleMiddleware;
		if (ruleMiddleware.length === 0) return next();
		let chain = composed.get(ruleMiddleware);
		if (!chain) {
			chain = composeMiddleware(ruleMiddleware);
			composed.set(ruleMiddleware, chain);
		}
		return chain(event, next);
	};
	return markUntraced(middleware);
}
function markUntraced(middleware) {
	middleware.__traced__ = true;
	return middleware;
}
//#endregion
//#region node_modules/.pnpm/nitro@3.0.260903-beta/node_modules/nitro/dist/runtime/internal/error/hooks.mjs
function _captureError(error, type) {
	console.error(`[${type}]`, error);
	useNitroApp().captureError?.(error, { tags: [type] });
}
function trapUnhandledErrors() {
	process.on("unhandledRejection", (error) => _captureError(error, "unhandledRejection"));
	process.on("uncaughtException", (error) => _captureError(error, "uncaughtException"));
}
//#endregion
//#region #nitro/virtual/tracing
var tracingSrvxPlugins = [];
//#endregion
//#region node_modules/.pnpm/nitro@3.0.260903-beta/node_modules/nitro/dist/runtime/internal/shutdown.mjs
function setupCloseHooks(server) {
	const closeServer = server.close.bind(server);
	let closeHooks;
	server.close = (closeActiveConnections) => closeServer(closeActiveConnections).finally(() => closeHooks ??= callCloseHooks());
}
async function callCloseHooks() {
	try {
		await useNitroHooks().callHook("close");
	} catch (error) {
		console.error("[nitro] Error while calling `close` hooks:", error);
	}
}
//#endregion
//#region node_modules/.pnpm/nitro@3.0.260903-beta/node_modules/nitro/dist/presets/node/runtime/node-server.mjs
var _parsedPort = Number.parseInt(process.env.NITRO_PORT ?? process.env.PORT ?? "");
var port = Number.isNaN(_parsedPort) ? 3e3 : _parsedPort;
var host = process.env.NITRO_HOST || process.env.HOST;
var cert = process.env.NITRO_SSL_CERT;
var key = process.env.NITRO_SSL_KEY;
var nitroApp = useNitroApp();
setupCloseHooks(serve({
	port,
	hostname: host,
	tls: cert && key ? {
		cert,
		key
	} : void 0,
	fetch: nitroApp.fetch,
	plugins: [...tracingSrvxPlugins]
}));
trapUnhandledErrors();
var node_server_default = {};
//#endregion
export { createSession, node_server_default as default, enforceExpirations, readData, removeSession, requireSession, updateData };
