import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { HarborData, ServerId } from "./types";

const DATA_DIRECTORY = process.env.HARBORGATE_DATA_DIR?.trim() || resolve(process.cwd(), ".harborgate");
const DATA_PATH = resolve(DATA_DIRECTORY, "data.json");
const EMPTY_DATA: HarborData = { expirations: {}, events: [], instances: [], plexShares: {} };
let writeQueue = Promise.resolve();

export const expirationKey = (serverId: ServerId, userId: string, serverScope?: string) =>
  `${serverId}:${serverScope ? `${serverScope}:` : ""}${userId}`;

export function getExpiration(data: HarborData, serverId: ServerId, userId: string, serverScope?: string) {
  return data.expirations[expirationKey(serverId, userId, serverScope)] ?? (serverId === "emby" ? data.expirations[userId] : undefined);
}

export async function readData(): Promise<HarborData> {
  try {
    const stored = JSON.parse(await readFile(DATA_PATH, "utf8")) as HarborData;
    return {
      expirations: stored.expirations ?? {},
      events: Array.isArray(stored.events) ? stored.events : [],
      instances: Array.isArray(stored.instances) ? stored.instances : [],
      plexShares: stored.plexShares ?? {},
    };
  } catch {
    return { expirations: {}, events: [], instances: [], plexShares: {} };
  }
}

export async function updateData(change: (data: HarborData) => void): Promise<HarborData> {
  let result = EMPTY_DATA;
  writeQueue = writeQueue.then(async () => {
    const data = await readData();
    change(data);
    data.events = data.events.slice(0, 100);
    await mkdir(dirname(DATA_PATH), { recursive: true });
    const temporaryPath = `${DATA_PATH}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(data, null, 2), { mode: 0o600 });
    await rename(temporaryPath, DATA_PATH);
    result = data;
  });
  await writeQueue;
  return result;
}
