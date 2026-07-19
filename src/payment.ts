import type { RequestHandler } from "express";
import { AsyncLocalStorage } from "node:async_hooks";
import { facilitator } from "@coinbase/x402";
import { HTTPFacilitatorClient, type FacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";

export type PaymentMode = "disabled" | "testnet" | "mainnet";
export interface PaymentConfig { mode: PaymentMode; payTo: `0x${string}`; price: string }
const FACILITATOR_DEADLINE_MS = 10_000;
const facilitatorSignal = new AsyncLocalStorage<AbortSignal>();
let fetchDeadlineInstalled = false;

function installFacilitatorFetchDeadline(): void {
  if (fetchDeadlineInstalled) return;
  const upstreamFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (input, init) => {
    const deadline = facilitatorSignal.getStore();
    if (!deadline) return upstreamFetch(input, init);
    const signal = init?.signal ? AbortSignal.any([init.signal, deadline]) : deadline;
    return upstreamFetch(input, { ...init, signal });
  };
  fetchDeadlineInstalled = true;
}

function withDeadline<T>(operation: () => Promise<T>, name: string): Promise<T> {
  const controller = new AbortController();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error(`Facilitator ${name} timed out`);
      controller.abort(error);
      reject(error);
    }, FACILITATOR_DEADLINE_MS);
    timer.unref();
    let pending: Promise<T>;
    try {
      pending = facilitatorSignal.run(controller.signal, operation);
    } catch (error) {
      clearTimeout(timer);
      reject(error);
      return;
    }
    pending.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

function deadlineClient(client: HTTPFacilitatorClient): FacilitatorClient {
  return {
    verify: (payload, requirements) => withDeadline(() => client.verify(payload, requirements), "verify"),
    settle: (payload, requirements) => withDeadline(() => client.settle(payload, requirements), "settle"),
    getSupported: () => withDeadline(() => client.getSupported(), "supported"),
  };
}

export function loadPaymentConfig(): PaymentConfig {
  const mode = (process.env.X402_MODE || "disabled") as PaymentMode;
  if (!["disabled", "testnet", "mainnet"].includes(mode)) throw new Error(`Invalid X402_MODE: ${mode}`);
  const payTo = process.env.X402_PAY_TO || "0x0000000000000000000000000000000000000000";
  if (!/^0x[0-9a-fA-F]{40}$/.test(payTo)) throw new Error("X402_PAY_TO must be an EVM address");
  if (mode !== "disabled" && /^0x0{40}$/i.test(payTo)) throw new Error("X402_PAY_TO must be configured when x402 is enabled");
  const price = process.env.X402_PRICE || "$0.01";
  if (!/^\$\d+(?:\.\d{1,6})?$/.test(price)) throw new Error("X402_PRICE must be a dollar amount such as $0.01");
  return { mode, payTo: payTo as `0x${string}`, price };
}

export function createPaymentMiddleware(config: PaymentConfig): RequestHandler | null {
  if (config.mode === "disabled") return null;
  installFacilitatorFetchDeadline();
  const network = config.mode === "mainnet" ? "eip155:8453" : "eip155:84532";
  const rawFacilitatorClient = config.mode === "mainnet"
    ? new HTTPFacilitatorClient(facilitator)
    : new HTTPFacilitatorClient({ url: "https://x402.org/facilitator" });
  const facilitatorClient = deadlineClient(rawFacilitatorClient);
  const server = new x402ResourceServer(facilitatorClient).register(network, new ExactEvmScheme());
  return paymentMiddleware({
    "POST /api/v1/scan/paid": {
      accepts: [{ scheme: "exact", price: config.price, network, payTo: config.payTo }],
      description: "Scan untrusted text or a public URL for prompt injection and return a cryptographic evidence report.",
      mimeType: "application/json",
    },
  }, server) as RequestHandler;
}
