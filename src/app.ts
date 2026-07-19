import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { scanText } from "./scanner.js";
import { fetchPublicText } from "./fetcher.js";
import { createPaymentMiddleware, loadPaymentConfig } from "./payment.js";
import { rateLimit } from "./rate-limit.js";

const publicDir = process.env.BOUNDARY_PUBLIC_DIR || path.resolve(process.cwd(), "public");

function readText(body: unknown, maxLength: number): string {
  if (!body || typeof body !== "object" || typeof (body as { text?: unknown }).text !== "string") {
    throw Object.assign(new Error("Body must include a text string"), { status: 400 });
  }
  const text = (body as { text: string }).text;
  if (!text.trim()) throw Object.assign(new Error("Text cannot be empty"), { status: 400 });
  if (text.length > maxLength) throw Object.assign(new Error(`Text exceeds ${maxLength} characters`), { status: 413 });
  return text;
}

export function createApp() {
  const app = express();
  const payment = loadPaymentConfig();
  app.disable("x-powered-by");
  app.set("trust proxy", process.env.TRUST_PROXY === "true" ? 1 : false);
  app.use(helmet({ crossOriginResourcePolicy: { policy: "same-origin" } }));
  app.use(express.json({ limit: "300kb", type: ["application/json", "application/*+json"] }));
  app.use(express.static(publicDir, { maxAge: process.env.NODE_ENV === "production" ? "1h" : 0 }));

  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok", service: "boundary", version: "0.1.0", paymentMode: payment.mode, payTo: payment.payTo });
  });
  app.get("/openapi.json", (_req, res) => res.json({
    openapi: "3.1.0", info: { title: "Boundary Agent Firewall", version: "0.1.0" },
    paths: {
      "/api/v1/scan": { post: { summary: "Free text-only scan (5,000 characters)", responses: { "200": { description: "Scan report" } } } },
      "/api/v1/scan/paid": { post: { summary: "Paid full text or public URL scan", responses: { "200": { description: "Scan report" }, "402": { description: "x402 payment required" } } } },
    },
  }));

  app.post("/api/v1/scan", rateLimit(20, 60 * 60 * 1000), (req, res, next) => {
    try {
      const text = readText(req.body, 5_000);
      res.json({ ...scanText(text, { kind: "text", value: "free-demo" }), billing: { mode: "free", price: "$0" } });
    } catch (error) { next(error); }
  });

  const x402 = createPaymentMiddleware(payment);
  if (x402) app.use(x402);

  app.post("/api/v1/scan/paid", rateLimit(120, 60 * 60 * 1000), async (req, res, next) => {
    try {
      if (payment.mode === "disabled" && process.env.NODE_ENV === "production") {
        res.status(503).json({ error: "payments_not_configured" });
        return;
      }
      const body = req.body as { text?: unknown; url?: unknown } | undefined;
      const hasText = typeof body?.text === "string";
      const hasUrl = typeof body?.url === "string";
      if (hasText === hasUrl) throw Object.assign(new Error("Provide exactly one of text or url"), { status: 400 });
      if (hasText) {
        const text = readText(body, 100_000);
        res.json({ ...scanText(text, { kind: "text", value: "paid-request" }), billing: { mode: payment.mode, price: payment.price } });
        return;
      }
      const url = String(body?.url);
      const fetched = await fetchPublicText(url);
      res.json({
        ...scanText(fetched.text, { kind: "url", value: fetched.finalUrl }),
        fetch: { contentType: fetched.contentType, bytes: fetched.bytes },
        billing: { mode: payment.mode, price: payment.price },
      });
    } catch (error) { next(error); }
  });

  app.get("/robots.txt", (_req, res) => res.type("text/plain").send("User-agent: *\nAllow: /\n"));
  app.get("/.well-known/agent.json", (_req, res) => res.json({
    name: "Boundary", description: "Deterministic prompt-injection scanner for agents", version: "0.1.0",
    endpoints: { openapi: "/openapi.json", scan: "/api/v1/scan/paid" },
    payment: { protocol: "x402", mode: payment.mode, price: payment.price, network: payment.mode === "mainnet" ? "eip155:8453" : "eip155:84532" },
  }));

  app.use((error: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
    const status = Number.isInteger(error.status) ? error.status! : 400;
    res.status(status).json({ error: status >= 500 ? "internal_error" : "invalid_request", message: error.message });
  });
  return app;
}
