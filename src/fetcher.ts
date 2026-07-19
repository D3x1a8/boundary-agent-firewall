import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { convert } from "html-to-text";
import ipaddr from "ipaddr.js";
import type { FetchedContent } from "./types.js";

const MAX_BYTES = 256 * 1024;
const MAX_REDIRECTS = 3;
const FETCH_DEADLINE_MS = 10_000;
const ALLOWED_TYPES = ["text/html", "text/plain", "text/markdown", "application/json", "application/xml", "text/xml"];

export function isPublicAddress(address: string): boolean {
  try {
    let parsed = ipaddr.parse(address);
    if (parsed.kind() === "ipv6") {
      const ipv6 = parsed as ipaddr.IPv6;
      if (ipv6.isIPv4MappedAddress()) parsed = ipv6.toIPv4Address();
    }
    return parsed.range() === "unicast";
  } catch { return false; }
}

export function validatePublicUrl(url: URL): void {
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only HTTP and HTTPS URLs are allowed");
  if (url.username || url.password) throw new Error("URLs with embedded credentials are not allowed");
  if (url.port && !((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443"))) {
    throw new Error("Only standard HTTP and HTTPS ports are allowed");
  }
}

function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason ?? new Error("Fetch aborted"));
    signal.addEventListener("abort", onAbort, { once: true });
    operation.then(
      (value) => { signal.removeEventListener("abort", onAbort); resolve(value); },
      (error) => { signal.removeEventListener("abort", onAbort); reject(error); },
    );
  });
}

async function resolvePublicAddress(hostname: string, signal: AbortSignal): Promise<{ address: string; family: 4 | 6 }> {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (normalized === "localhost" || normalized.endsWith(".localhost") || normalized.endsWith(".local")) {
    throw new Error("Private or local hosts are not allowed");
  }
  if (ipaddr.isValid(normalized)) {
    if (!isPublicAddress(normalized)) throw new Error("Private, reserved, or local IP addresses are not allowed");
    return { address: normalized, family: ipaddr.parse(normalized).kind() === "ipv6" ? 6 : 4 };
  }
  const answers = await abortable(dns.lookup(normalized, { all: true, verbatim: true }), signal);
  if (!answers.length || answers.some((answer) => !isPublicAddress(answer.address))) {
    throw new Error("Host resolves to a private, reserved, or local address");
  }
  return { address: answers[0].address, family: answers[0].family as 4 | 6 };
}

interface RawResponse { status: number; headers: http.IncomingHttpHeaders; body: Buffer }

async function requestPinned(url: URL, signal: AbortSignal): Promise<RawResponse> {
  const resolved = await resolvePublicAddress(url.hostname, signal);
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
      signal,
    }, (response) => {
      const declaredLength = Number(response.headers["content-length"] || 0);
      if (declaredLength > MAX_BYTES) {
        request.destroy(new Error(`Response exceeded ${MAX_BYTES} bytes`));
        return;
      }
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

export async function fetchPublicText(input: string, callerSignal?: AbortSignal): Promise<FetchedContent> {
  const deadlineSignal = AbortSignal.timeout(FETCH_DEADLINE_MS);
  const signal = callerSignal ? AbortSignal.any([callerSignal, deadlineSignal]) : deadlineSignal;
  let current: URL;
  try { current = new URL(input); } catch { throw new Error("URL is invalid"); }
  validatePublicUrl(current);

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const response = await requestPinned(current, signal);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.location;
      if (!location) throw new Error("Redirect response did not include a location");
      if (redirect === MAX_REDIRECTS) throw new Error("Too many redirects");
      current = new URL(location, current);
      validatePublicUrl(current);
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
