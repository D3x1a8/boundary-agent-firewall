import type { RequestHandler } from "express";

const windows = new Map<string, number[]>();

export function rateLimit(max: number, windowMs: number): RequestHandler {
  return (req, res, next) => {
    const now = Date.now();
    const key = `${req.ip}:${req.path}`;
    const recent = (windows.get(key) ?? []).filter((time) => now - time < windowMs);
    recent.push(now);
    windows.set(key, recent);
    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, max - recent.length)));
    if (recent.length > max) {
      res.status(429).json({ error: "rate_limit_exceeded", retryAfterSeconds: Math.ceil(windowMs / 1000) });
      return;
    }
    if (windows.size > 10_000) {
      for (const [entry, timestamps] of windows) {
        if (timestamps.every((time) => now - time >= windowMs)) windows.delete(entry);
      }
    }
    next();
  };
}

export function resetRateLimits(): void { windows.clear(); }
