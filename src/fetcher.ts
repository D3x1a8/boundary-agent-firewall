import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { convert } from "html-to-text";
import type { FetchedContent } from "./types.js";

const MAX_BYTES = 256 * 1024;
const MAX_REDIRECTS = 3;
const ALLOWED_TYPES = ["text/html", "text/plain", "text/markdown", "application/json", "application/xml", "text/xml"];

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b, c] = parts;
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

export function isPublicAddress(address: string): boolean {
  if (net.isIPv4(address)) return !isPrivateIpv4(address);
  if (!net.isIPv6(address)) return false;
  const value = address.toLowerCase();
  if (value.startsWith("::ffff:")) return isPublicAddress(value.slice(7));
  return !(
    value === "::" || value === "::1" || value.startsWith("fc") || value.startsWith("fd") ||
    value.startsWith("fe8") || value.startsWith("fe9") || value.startsWith("fea") || value.startsWith("feb") ||
    value.startsWith("2001:db8")
  );
}

async function resolvePublicAddress(hostname: string): Promise<{ address: string; family: 4 | 6 }> {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (normalized === "localhost" || normalized.endsWith(".localhost") || normalized.endsWith(".local")) {
    throw new Error("Private or local hosts are not allowed");
  }
  if (net.isIP(normalized)) {
    if (!isPublicAddress(normalized)) throw new Error("Private, reserved, or local IP addresses are not allowed");
    return { address: normalized, family: net.isIPv6(normalized) ? 6 : 4 };
  }
  const answers = await dns.lookup(normalized, { all: true, verbatim: true });
  if (!answers.length || answers.some((answer) => !isPublicAddress(answer.address))) {
    throw new Error("Host resolves to a private, reserved, or local address");
  }
  return { address: answers[0].address, family: answers[0].family as 4 | 6 };
}

interface RawResponse { status: number; headers: http.IncomingHttpHeaders; body: Buffer }

async function requestPinned(url: URL): Promise<RawResponse> {
  const resolved = await resolvePublicAddress(url.hostname);
  const transport = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const request = transport.request({
      protocol: url.protocol,
      hostname: resolved.address,
      family: resolved.family,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method: "GET",
      servername: url.hostname,
      headers: {
        Host: url.host,
        "User-Agent": "BoundaryBot/0.1",
        Accept: "text/html,text/plain,text/markdown,application/json,application/xml;q=0.8",
        "Accept-Encoding": "identity",
      },
      timeout: 8_000,
    }, (response) => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BYTES) {
          request.destroy(new Error(`Response exceeded ${MAX_BYTES} bytes`));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => resolve({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks) }));
    });
    request.on("timeout", () => request.destroy(new Error("Fetch timed out")));
    request.on("error", reject);
    request.end();
  });
}

function htmlToText(html: string): string {
  return convert(html, {
    wordwrap: false,
    selectors: [
      { selector: "script", format: "skip" }, { selector: "style", format: "skip" },
      { selector: "noscript", format: "skip" }, { selector: "svg", format: "skip" },
      { selector: "img", format: "skip" }, { selector: "a", options: { ignoreHref: true } },
    ],
  }).replace(/\n{3,}/g, "\n\n").trim();
}

export async function fetchPublicText(input: string): Promise<FetchedContent> {
  let current: URL;
  try { current = new URL(input); } catch { throw new Error("URL is invalid"); }
  if (!["http:", "https:"].includes(current.protocol)) throw new Error("Only HTTP and HTTPS URLs are allowed");
  if (current.username || current.password) throw new Error("URLs with embedded credentials are not allowed");

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const response = await requestPinned(current);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.location;
      if (!location) throw new Error("Redirect response did not include a location");
      if (redirect === MAX_REDIRECTS) throw new Error("Too many redirects");
      current = new URL(location, current);
      if (!["http:", "https:"].includes(current.protocol)) throw new Error("Redirected to an unsupported protocol");
      continue;
    }
    if (response.status < 200 || response.status >= 300) throw new Error(`Upstream returned HTTP ${response.status}`);
    const contentType = String(response.headers["content-type"] || "text/plain").split(";")[0].trim().toLowerCase();
    if (!ALLOWED_TYPES.includes(contentType)) throw new Error(`Unsupported content type: ${contentType}`);
    const raw = response.body.toString("utf8");
    const text = contentType === "text/html" ? htmlToText(raw) : raw.trim();
    return { finalUrl: current.toString(), contentType, text, bytes: response.body.length };
  }
  throw new Error("Unable to fetch URL");
}
