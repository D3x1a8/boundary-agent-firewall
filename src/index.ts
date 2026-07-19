import { createApp } from "./app.js";

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "0.0.0.0";
const app = createApp();
export default app;

if (!process.env.VERCEL) {
  const server = app.listen(port, host, () => {
    console.log(JSON.stringify({ level: "info", event: "server_started", host, port, at: new Date().toISOString() }));
  });
  const shutdown = (signal: string) => {
    console.log(JSON.stringify({ level: "info", event: "shutdown", signal, at: new Date().toISOString() }));
    server.close((error) => process.exit(error ? 1 : 0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
