import { defineHandler } from "../../_libs/h3+rou3+srvx.mjs";
//#region server/routes/api/health.get.ts
var health_get_default = defineHandler(() => ({
	status: "ok",
	service: "harborgate",
	timestamp: (/* @__PURE__ */ new Date()).toISOString()
}));
//#endregion
export { health_get_default as default };
