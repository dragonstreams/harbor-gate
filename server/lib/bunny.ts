import { randomBytes } from "node:crypto";
import type { ServerId } from "./types";

const BUNNY_API = "https://api.bunny.net";

export type BunnyDeploymentInput = {
  name: string;
  slug: string;
  serverId: ServerId;
  serverUrl: string;
  serverToken?: string;
};

type BunnyApplication = {
  id?: string;
  appId?: string;
  name?: string;
  containerTemplates?: BunnyContainer[];
};

type BunnyApplicationList = {
  items?: BunnyApplication[];
};

type BunnyContainer = {
  id?: string;
};

type BunnyEndpoint = {
  publicHost?: string;
  pullZoneId?: string | number;
};

type BunnyEndpointList = { items?: BunnyEndpoint[] } | BunnyEndpoint[];

type BunnyLimits = {
  maxNumberOfApplications?: number;
  existingNumberOfApplications?: number;
};

type BunnyImageConfig = {
  image?: string;
};

type BunnyImageDigest = {
  imageDigest?: string;
};

function looksLikeGitHubToken(value: string) {
  return /^(?:ghp_|github_pat_)/i.test(value);
}

function redactSecrets(value: string) {
  return value
    .replace(/github_pat_[A-Za-z0-9_]+/gi, "[REDACTED_GITHUB_TOKEN]")
    .replace(/ghp_[A-Za-z0-9]+/gi, "[REDACTED_GITHUB_TOKEN]");
}

function parseImageReference(value: string) {
  const normalized = value.replace(/^https?:\/\//, "").replace(/^\/+/, "");
  if (looksLikeGitHubToken(normalized)) throw new Error("HARBORGATE_CHILD_IMAGE must be a container image address, not a GitHub token");
  if (!normalized.includes("/")) throw new Error("HARBORGATE_CHILD_IMAGE must include a registry, namespace, and image name");
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
    imageName,
    imageNamespace: parts.join("/") || "library",
    imageTag,
  };
}

function configuration() {
  const apiKey = process.env.BUNNY_API_KEY?.trim();
  const image = process.env.HARBORGATE_CHILD_IMAGE?.trim();
  const regionId = process.env.BUNNY_REGION_ID?.trim();
  const registryId = process.env.BUNNY_REGISTRY_ID?.trim();
  if (!apiKey || !image || !regionId || !registryId) {
    throw new Error("Bunny deployment requires BUNNY_API_KEY, HARBORGATE_CHILD_IMAGE, BUNNY_REGION_ID, and BUNNY_REGISTRY_ID");
  }
  if (looksLikeGitHubToken(registryId)) {
    throw new Error("BUNNY_REGISTRY_ID must be 'github' or a Bunny registry UUID, not a GitHub token");
  }
  return {
    apiKey,
    image: parseImageReference(image),
    regionId,
    registryId,
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
    const responseText = await response.text();
    let detail = responseText;
    try {
      const parsed = JSON.parse(responseText) as { detail?: string; errors?: Array<{ field?: string; message?: string }> };
      detail = parsed.errors?.map((error) => `${error.field ? `${error.field}: ` : ""}${error.message ?? "Invalid value"}`).join("; ") || parsed.detail || responseText;
    } catch {
      // Bunny occasionally returns plain text errors.
    }
    throw new Error(redactSecrets(detail).slice(0, 600) || `Bunny request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  const responseText = await response.text();
  if (!responseText.trim()) return undefined as T;
  return JSON.parse(responseText) as T;
}

export function getBunnyConfigurationStatus() {
  const missing = [
    !process.env.BUNNY_API_KEY?.trim() && "BUNNY_API_KEY",
    !process.env.HARBORGATE_CHILD_IMAGE?.trim() && "HARBORGATE_CHILD_IMAGE",
    !process.env.BUNNY_REGION_ID?.trim() && "BUNNY_REGION_ID",
    !process.env.BUNNY_REGISTRY_ID?.trim() && "BUNNY_REGISTRY_ID",
    !process.env.HARBORGATE_ENCRYPTION_KEY?.trim() && "HARBORGATE_ENCRYPTION_KEY",
  ].filter(Boolean) as string[];
  return { ready: missing.length === 0, missing };
}

export async function deployBunnyInstance(input: BunnyDeploymentInput) {
  const config = configuration();
  let limits: BunnyLimits;
  try {
    limits = await bunnyRequest<BunnyLimits>("/mc/limits");
  } catch (error) {
    throw new Error(`Bunny account limits could not be checked: ${error instanceof Error ? error.message : "Unknown Bunny error"}`);
  }
  if (typeof limits.maxNumberOfApplications === "number" && typeof limits.existingNumberOfApplications === "number" &&
      limits.existingNumberOfApplications >= limits.maxNumberOfApplications) {
    throw new Error(`Bunny application limit reached (${limits.existingNumberOfApplications}/${limits.maxNumberOfApplications}). Remove unused applications or upgrade the Bunny account before deploying a child instance.`);
  }

  let imageConfig: BunnyImageConfig;
  try {
    imageConfig = await bunnyRequest<BunnyImageConfig>("/mc/registries/image-config", {
      method: "POST",
      body: JSON.stringify({
        registryId: config.registryId,
        imageNamespace: config.image.imageNamespace,
        imageName: config.image.imageName,
        tag: config.image.imageTag,
      }),
    });
  } catch (error) {
    const detail = error instanceof Error ? redactSecrets(error.message) : "";
    throw new Error(`Bunny could not access the configured child image. Verify HARBORGATE_CHILD_IMAGE, BUNNY_REGISTRY_ID, and the linked registry credentials. ${detail}`.trim());
  }
  const canonicalImage = imageConfig?.image || `${config.image.imageNamespace}/${config.image.imageName}:${config.image.imageTag}`;
  let imageDigest: string | undefined;
  try {
    const digest = await bunnyRequest<BunnyImageDigest>("/mc/registries/digest", {
      method: "POST",
      body: JSON.stringify({
        registryId: config.registryId,
        imageNamespace: config.image.imageNamespace,
        imageName: config.image.imageName,
        tag: config.image.imageTag,
      }),
    });
    imageDigest = digest?.imageDigest;
  } catch (error) {
    throw new Error(`Bunny could not resolve the child image digest: ${error instanceof Error ? redactSecrets(error.message) : "Unknown Bunny error"}`);
  }

  const tokenVariable = input.serverId === "emby" ? "HARBORGATE_EMBY_API_KEY" : "HARBORGATE_JELLYFIN_API_KEY";
  const container: Record<string, unknown> = {
    name: "harborgate",
    image: canonicalImage,
    imageName: config.image.imageName,
    imageNamespace: config.image.imageNamespace,
    imageTag: config.image.imageTag,
    ...(imageDigest ? { imageDigest } : {}),
    imagePullPolicy: "always",
    environmentVariables: [
      { name: "NODE_ENV", value: "production" },
      { name: "PORT", value: "8080" },
      { name: "HOST", value: "0.0.0.0" },
      { name: "HARBORGATE_DATA_DIR", value: "/data" },
      { name: "HARBORGATE_MODE", value: "child" },
      { name: "HARBORGATE_SERVER_TYPE", value: input.serverId },
      { name: "HARBORGATE_SERVER_URL", value: input.serverUrl },
      ...(input.serverId !== "plex" && input.serverToken ? [{ name: tokenVariable, value: input.serverToken }] : []),
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
    imageRegistryId: config.registryId,
  };
  const minimalContainer = {
    name: "harborgate",
    image: canonicalImage,
    imageName: config.image.imageName,
    imageNamespace: config.image.imageNamespace,
    imageTag: config.image.imageTag,
    ...(imageDigest ? { imageDigest } : {}),
    imagePullPolicy: "always",
    imageRegistryId: config.registryId,
  };

  const applicationName = `harborgate-${input.slug}-${randomBytes(3).toString("hex")}`;
  let application: BunnyApplication | undefined;
  let creationError: unknown;
  try {
    application = await bunnyRequest<BunnyApplication>("/mc/apps", {
      method: "POST",
      body: JSON.stringify({
        name: applicationName,
        runtimeType: "shared",
        autoScaling: { min: 1, max: 1 },
        regionSettings: {
          allowedRegionIds: [config.regionId],
          requiredRegionIds: [config.regionId],
          maxAllowedRegions: 1,
          nodeSelectors: {},
        },
        terminationGracePeriodSeconds: 30,
        containerTemplates: [minimalContainer],
        volumes: [],
      }),
    });
  } catch (error) {
    creationError = error;
    for (let attempt = 0; attempt < 3 && !application; attempt += 1) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 500));
      const applications = await bunnyRequest<BunnyApplicationList>("/mc/apps?limit=100").catch(() => ({ items: [] }));
      application = applications.items?.find((item) => item.name === applicationName);
    }
  }
  if (!application) {
    const usage = typeof limits.existingNumberOfApplications === "number" && typeof limits.maxNumberOfApplications === "number"
      ? ` Bunny reports ${limits.existingNumberOfApplications}/${limits.maxNumberOfApplications} application slots in use.`
      : "";
    throw new Error(`Bunny application creation failed after image metadata and digest validation.${usage} ${creationError instanceof Error ? creationError.message : "Unknown Bunny error"}`);
  }
  const appId = application.id ?? application.appId;
  if (!appId) throw new Error("Bunny application creation succeeded but no application ID was returned");

  let createdContainer = application.containerTemplates?.[0];
  if (!createdContainer?.id) {
    const currentApplication = await bunnyRequest<BunnyApplication>(`/mc/apps/${encodeURIComponent(appId)}`);
    createdContainer = currentApplication.containerTemplates?.[0];
  }
  if (!createdContainer?.id) {
    await bunnyRequest<void>(`/mc/apps/${encodeURIComponent(appId)}`, { method: "DELETE" }).catch(() => undefined);
    throw new Error(`Bunny application ${appId} was created, but its required container ID was not returned`);
  }

  try {
    await bunnyRequest<void>(`/mc/apps/${encodeURIComponent(appId)}`, {
      method: "PATCH",
      body: JSON.stringify({ volumes: [{ name: "data", size: 1 }] }),
    });
    await bunnyRequest<void>(`/mc/apps/${encodeURIComponent(appId)}/containers/${encodeURIComponent(createdContainer.id)}`, {
      method: "PATCH",
      body: JSON.stringify(container),
    });
  } catch (error) {
    await bunnyRequest<void>(`/mc/apps/${encodeURIComponent(appId)}`, { method: "DELETE" }).catch(() => undefined);
    throw new Error(`Bunny application ${appId} was created, but its HarborGate configuration could not be applied: ${error instanceof Error ? error.message : "Unknown Bunny error"}`);
  }

  try {
    await bunnyRequest<void>(`/mc/apps/${encodeURIComponent(appId)}/deploy`, { method: "POST" });
  } catch (error) {
    throw new Error(`Bunny application ${appId} and container ${createdContainer.id} were created, but deployment failed: ${error instanceof Error ? error.message : "Unknown Bunny error"}`);
  }
  let listed: BunnyEndpointList;
  try {
    listed = await bunnyRequest<BunnyEndpointList>(`/mc/apps/${encodeURIComponent(appId)}/endpoints`);
  } catch (error) {
    throw new Error(`Bunny application ${appId} was deployed, but its endpoint could not be read: ${error instanceof Error ? error.message : "Unknown Bunny error"}`);
  }
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
