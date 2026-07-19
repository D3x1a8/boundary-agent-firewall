import type { RequestHandler } from "express";

interface WindowCounter { startedAt: number; count: number }

const windows = new Map<string, WindowCounter>();
const MAX_KEYS = 10_000;

function removeExpired(now: number, windowMs: number): void {
  for (const [key, counter] of windows) {
    if (now - counter.startedAt >= windowMs) windows.delete(key);
  }
}

function evictOldest(): void {
  const oldest = windows.keys().next().value as string | undefined;
  if (oldest) windows.delete(oldest);
}

export function rateLimit(max: number, windowMs: number, scope = "default"): RequestHandler {
  return (req, res, next) => {
    const now = Date.now();
    const key = `${scope}:${req.ip}:${req.path}`;
    let counter = windows.get(key);
    if (!counter || now - counter.startedAt >= windowMs) {
      if (!counter && windows.size >= MAX_KEYS) removeExpired(now, windowMs);
      if (!counter && windows.size >= MAX_KEYS) evictOldest();
      counter = { startedAt: now, count: 0 };
      windows.set(key, counter);
    } else {
      // Refresh insertion order so capacity eviction behaves as a bounded LRU.
      windows.delete(key);
      windows.set(key, counter);
    }
    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, max - counter.count)));
    if (counter.count >= max) {
      res.status(429).json({ error: "rate_limit_exceeded", retryAfterSeconds: Math.ceil(windowMs / 1000) });
      return;
    }
    counter.count += 1;
    res.setHeader("RateLimit-Remaining", String(Math.max(0, max - counter.count)));
    next();
  };
}

export function resetRateLimits(): void { windows.clear(); }
