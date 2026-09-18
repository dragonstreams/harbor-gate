import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

export type EncryptedSecret = {
  iv: string;
  tag: string;
  ciphertext: string;
};

function encryptionKey() {
  const configured = process.env.HARBORGATE_ENCRYPTION_KEY?.trim();
  if (!configured) throw new Error("HARBORGATE_ENCRYPTION_KEY is not configured");
  const key = /^[a-f\d]{64}$/i.test(configured) ? Buffer.from(configured, "hex") : Buffer.from(configured, "base64");
  if (key.length !== 32) throw new Error("HARBORGATE_ENCRYPTION_KEY must be a 32-byte base64 or 64-character hex key");
  return key;
}

export function encryptCredentials(username: string, password: string): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify({ username, password }), "utf8"), cipher.final()]);
  return {
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

export function decryptCredentials(secret: EncryptedSecret): { username: string; password: string } {
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(secret.iv, "base64"));
  decipher.setAuthTag(Buffer.from(secret.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(secret.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(plaintext) as { username: string; password: string };
}

function isPrivateIpv4(address: string) {
  const [a, b, c] = address.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113) || a >= 224;
}

function isPrivateAddress(address: string) {
  if (isIP(address) === 4) return isPrivateIpv4(address);
  const normalized = address.toLowerCase();
  if (normalized.startsWith("::ffff:")) return isPrivateIpv4(normalized.slice(7));
  return normalized === "::" || normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") ||
    normalized.startsWith("ff") || normalized.startsWith("2001:db8:") || /^fe[89ab]/.test(normalized);
}

export async function validatePublicServerUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a valid media server URL");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("The media server address must be an HTTPS URL without credentials, a query, or a fragment");
  }
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("The media server must resolve only to public internet addresses");
  }
  const pathname = url.pathname.replace(/\/+$/, "");
  return `${url.origin}${pathname}`;
}
