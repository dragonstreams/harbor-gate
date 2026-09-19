import type { ServerId } from "./types";

const BUNNY_API = "https://api.bunny.net";

export type BunnyDeploymentInput = {
  name: string;
  slug: string;
  serverId: ServerId;
  serverUrl: string;
  serverToken: string;
};

type BunnyApplication = {
  id?: string;
  appId?: string;
  containerTemplates?: Array<{ id?: string }>;
};

type BunnyEndpoint = {
  publicHost?: string;
  pullZoneId?: string | number;
};

type BunnyEndpointList = { items?: BunnyEndpoint[] } | BunnyEndpoint[];

function parseImageReference(value: string) {
  const normalized = value.replace(/^https?:\/\//, "").replace(/^\/+/, "");
  if (normalized.includes("@")) throw new Error("HARBORGATE_CHILD_IMAGE must use an image tag rather than a digest");
  const lastSlash = normalized.lastIndexOf("/");
  const lastColon = normalized.lastIndexOf(":");
  const imageTag = lastColon > lastSlash ? normalized.slice(lastColon + 1) : "latest";
  const repository = lastColon > lastSlash ? normalized.slice(0, lastColon) : normalized;
  const parts = repository.split("/").filter(Boolean);
  if (!parts.length || !imageTag) throw new Error("HARBORGATE_CHILD_IMAGE is not a valid container image reference");
  if (parts[0].includes(".") || parts[0].includes(":") || parts[0] === "localhost") parts.shift();
  const imageName = parts.pop();
  if (!imageName) throw new Error("HARBORGATE_CHILD_IMAGE must include an image name");
  return {
    image: `${repository}:${imageTag}`,
    imageName,
    imageNamespace: parts.join("/") || "library",
    imageTag,
  };
}

function configuration() {
  const apiKey = process.env.BUNNY_API_KEY?.trim();
  const image = process.env.HARBORGATE_CHILD_IMAGE?.trim();
  const regionId = process.env.BUNNY_REGION_ID?.trim();
  if (!apiKey || !image || !regionId) {
    throw new Error("Bunny deployment requires BUNNY_API_KEY, HARBORGATE_CHILD_IMAGE, and BUNNY_REGION_ID");
  }
  return {
    apiKey,
    image: parseImageReference(image),
    regionId,
    registryId: process.env.BUNNY_REGISTRY_ID?.trim(),
    baseDomain: process.env.HARBORGATE_BASE_DOMAIN?.trim().replace(/^\.+|\.+$/g, "").toLowerCase(),
    dnsZoneId: process.env.BUNNY_DNS_ZONE_ID?.trim(),
  };
}

async function bunnyRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const { apiKey } = configuration();
  const response = await fetch(`${BUNNY_API}${path}`, {
    ...init,
    headers: { AccessKey: apiKey, "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(detail || `Bunny request failed (${response.status})`);
  }
  if (response.status === 204 || response.headers.get("content-length") === "0") return undefined as T;
  return response.json() as Promise<T>;
}

export function getBunnyConfigurationStatus() {
  const missing = [
    !process.env.BUNNY_API_KEY?.trim() && "BUNNY_API_KEY",
    !process.env.HARBORGATE_CHILD_IMAGE?.trim() && "HARBORGATE_CHILD_IMAGE",
    !process.env.BUNNY_REGION_ID?.trim() && "BUNNY_REGION_ID",
    !process.env.HARBORGATE_ENCRYPTION_KEY?.trim() && "HARBORGATE_ENCRYPTION_KEY",
  ].filter(Boolean) as string[];
  return { ready: missing.length === 0, missing };
}

export async function deployBunnyInstance(input: BunnyDeploymentInput) {
  const config = configuration();
  const tokenVariable = input.serverId === "emby" ? "HARBORGATE_EMBY_API_KEY" : "HARBORGATE_JELLYFIN_API_KEY";
  const container: Record<string, unknown> = {
    name: "harborgate",
    image: config.image.image,
    imageName: config.image.imageName,
    imageNamespace: config.image.imageNamespace,
    imageTag: config.image.imageTag,
    imagePullPolicy: "always",
    environmentVariables: [
      { name: "NODE_ENV", value: "production" },
      { name: "PORT", value: "8080" },
      { name: "HOST", value: "0.0.0.0" },
      { name: "HARBORGATE_DATA_DIR", value: "/data" },
      { name: "HARBORGATE_MODE", value: "child" },
      { name: "HARBORGATE_SERVER_TYPE", value: input.serverId },
      { name: "HARBORGATE_SERVER_URL", value: input.serverUrl },
      { name: tokenVariable, value: input.serverToken },
    ],
    volumeMounts: [{ name: "data", mountPath: "/data" }],
    endpoints: [{
      displayName: "HarborGate HTTPS",
      cdn: {
        isSslEnabled: false,
        portMappings: [{ containerPort: 8080, exposedPort: 80, protocols: ["tcp"] }],
      },
    }],
    probes: {
      startup: { initialDelaySeconds: 5, periodSeconds: 10, timeoutSeconds: 5, failureThreshold: 12, successThreshold: 1, httpGet: { request: { path: "/api/health", portNumber: 8080 }, response: { expectedStatusCode: "200" } } },
      readiness: { initialDelaySeconds: 5, periodSeconds: 10, timeoutSeconds: 5, failureThreshold: 3, successThreshold: 1, httpGet: { request: { path: "/api/health", portNumber: 8080 }, response: { expectedStatusCode: "200" } } },
      liveness: { initialDelaySeconds: 20, periodSeconds: 20, timeoutSeconds: 5, failureThreshold: 3, successThreshold: 1, httpGet: { request: { path: "/api/health", portNumber: 8080 }, response: { expectedStatusCode: "200" } } },
    },
  };
  if (config.registryId) container.imageRegistryId = config.registryId;

  const application = await bunnyRequest<BunnyApplication>("/mc/apps", {
    method: "POST",
    body: JSON.stringify({
      name: `harborgate-${input.slug}`,
      runtimeType: "shared",
      autoScaling: { min: 1, max: 1 },
      regionSettings: {
        allowedRegionIds: [config.regionId],
        requiredRegionIds: [config.regionId],
        maxAllowedRegions: 1,
        nodeSelectors: {},
      },
      terminationGracePeriodSeconds: 30,
      containerTemplates: [container],
      volumes: [{ name: "data", size: 1 }],
    }),
  });
  const appId = application.id ?? application.appId;
  if (!appId) throw new Error("Bunny created the application but did not return its ID");

  await bunnyRequest<void>(`/mc/apps/${encodeURIComponent(appId)}/deploy`, { method: "POST" });
  const listed = await bunnyRequest<BunnyEndpointList>(`/mc/apps/${encodeURIComponent(appId)}/endpoints`);
  const endpoints = Array.isArray(listed) ? listed : listed.items ?? [];
  const endpoint = endpoints.find((item) => item.publicHost);
  if (!endpoint?.publicHost) throw new Error("Bunny deployed the application but did not return a public hostname");

  let hostname = endpoint.publicHost;
  if (config.baseDomain && config.dnsZoneId && endpoint.pullZoneId) {
    const customHostname = `${input.slug}.${config.baseDomain}`;
    await bunnyRequest<void>(`/pullzone/${encodeURIComponent(String(endpoint.pullZoneId))}/addHostname`, {
      method: "POST",
      body: JSON.stringify({ Hostname: customHostname }),
    });
    await bunnyRequest<void>(`/dnszone/${encodeURIComponent(config.dnsZoneId)}/records`, {
      method: "PUT",
      body: JSON.stringify({ Type: 2, Name: input.slug, Value: endpoint.publicHost, Ttl: 300 }),
    });
    hostname = customHostname;
  }

  return { appId, publicUrl: `https://${hostname}`, bunnyHostname: endpoint.publicHost };
}
