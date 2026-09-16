//#region server/lib/emby.ts
var EMBY_URL = "https://33923.brr.savethecdn.com";
var clientHeader = "MediaBrowser Client=\"HarborGate\", Device=\"Secure Control Panel\", DeviceId=\"harborgate-server\", Version=\"1.0.0\"";
async function parseResponse(response) {
	if (!response.ok) {
		const detail = await response.text();
		const safeDetail = response.status === 401 ? "Invalid administrator credentials" : detail.slice(0, 180);
		throw new Error(safeDetail || `Emby request failed (${response.status})`);
	}
	if (response.status === 204 || response.headers.get("content-length") === "0") return void 0;
	return response.json();
}
async function authenticate(username, password) {
	const result = await parseResponse(await fetch(`${EMBY_URL}/Users/AuthenticateByName`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-Emby-Authorization": clientHeader
		},
		body: JSON.stringify({
			Username: username,
			Pw: password
		})
	}));
	if (!result.User.Policy?.IsAdministrator) throw new Error("This Emby account is not an administrator");
	return result;
}
async function embyFetch(token, path, init) {
	return parseResponse(await fetch(`${EMBY_URL}${path}`, {
		...init,
		headers: {
			"Content-Type": "application/json",
			"X-Emby-Token": token,
			"X-Emby-Authorization": clientHeader,
			...init?.headers
		}
	}));
}
var listUsers = (token) => embyFetch(token, "/Users");
var listFeatures = (token) => embyFetch(token, "/Features");
async function createUser(token, name) {
	return embyFetch(token, `/Users/New?Name=${encodeURIComponent(name)}`, { method: "POST" });
}
async function setUserPassword(token, userId, password) {
	return embyFetch(token, `/Users/${encodeURIComponent(userId)}/Password`, {
		method: "POST",
		body: JSON.stringify({
			NewPw: password,
			ResetPassword: false
		})
	});
}
async function updateUser(token, user, name, policy) {
	if (name !== user.Name) await embyFetch(token, `/Users/${encodeURIComponent(user.Id)}`, {
		method: "POST",
		body: JSON.stringify({
			...user,
			Name: name
		})
	});
	await setPolicy(token, user.Id, policy);
}
var setPolicy = (token, userId, policy) => embyFetch(token, `/Users/${encodeURIComponent(userId)}/Policy`, {
	method: "POST",
	body: JSON.stringify(policy)
});
var deleteUser = (token, userId) => embyFetch(token, `/Users/${encodeURIComponent(userId)}`, { method: "DELETE" });
//#endregion
export { authenticate, createUser, deleteUser, listFeatures, listUsers, setPolicy, setUserPassword, updateUser };
