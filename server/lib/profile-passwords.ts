import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ServerId } from "./types";
import type { EncryptedSecret } from "./instance-security";

const directory = process.env.HARBORGATE_DATA_DIR?.trim() || resolve(process.cwd(), ".harborgate");
const keyPath = resolve(directory, "profile-passwords.key");
let keyPromise: Promise<Buffer> | undefined;

async function loadKey() {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  try {
    await writeFile(keyPath, randomBytes(32), { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const key = await readFile(keyPath);
  if (key.length !== 32) throw new Error("Profile password encryption key is invalid");
  return key;
}

export function profilePasswordKey(serverId: ServerId, serverUrl: string, userId: string) {
  return JSON.stringify([serverId, serverUrl.replace(/\/+$/, ""), userId]);
}

export async function encryptProfilePassword(password: string, scope: string): Promise<EncryptedSecret> {
  const key = await (keyPromise ??= loadKey());
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(scope));
  const ciphertext = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  return { iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") };
}

export async function decryptProfilePassword(secret: EncryptedSecret, scope: string) {
  const key = await (keyPromise ??= loadKey());
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(secret.iv, "base64"));
  decipher.setAAD(Buffer.from(scope));
  decipher.setAuthTag(Buffer.from(secret.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(secret.ciphertext, "base64")), decipher.final()]).toString("utf8");
}
