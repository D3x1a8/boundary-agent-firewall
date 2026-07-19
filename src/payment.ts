import type { RequestHandler } from "express";
import { facilitator } from "@coinbase/x402";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";

export type PaymentMode = "disabled" | "testnet" | "mainnet";
export interface PaymentConfig { mode: PaymentMode; payTo: `0x${string}`; price: string }

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
  const network = config.mode === "mainnet" ? "eip155:8453" : "eip155:84532";
  const facilitatorClient = config.mode === "mainnet"
    ? new HTTPFacilitatorClient(facilitator)
    : new HTTPFacilitatorClient({ url: "https://x402.org/facilitator" });
  const server = new x402ResourceServer(facilitatorClient).register(network, new ExactEvmScheme());
  return paymentMiddleware({
    "POST /api/v1/scan/paid": {
      accepts: [{ scheme: "exact", price: config.price, network, payTo: config.payTo }],
      description: "Scan untrusted text or a public URL for prompt injection and return a cryptographic evidence report.",
      mimeType: "application/json",
    },
  }, server) as RequestHandler;
}
