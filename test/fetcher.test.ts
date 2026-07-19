import { describe, expect, it } from "vitest";
import { fetchPublicText, isPublicAddress } from "../src/fetcher.js";

describe("URL egress policy", () => {
  it.each(["127.0.0.1", "10.0.0.1", "169.254.169.254", "172.16.0.1", "192.168.1.1", "100.64.0.1", "::1", "0:0:0:0:0:0:0:1", "::ffff:127.0.0.1", "fc00::1", "fe80::1", "ff02::1", "2001:db8::1"])("rejects %s", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });
  it.each(["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"])("allows %s", (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });

  it("rejects credential-bearing URLs before fetching", async () => {
    await expect(fetchPublicText("https://user:secret@example.com")).rejects.toThrow("embedded credentials");
  });

  it("rejects non-web ports before fetching", async () => {
    await expect(fetchPublicText("https://example.com:22")).rejects.toThrow("standard HTTP and HTTPS ports");
  });

  it("honors caller cancellation across resolution and fetching", async () => {
    const signal = AbortSignal.abort(new Error("caller stopped"));
    await expect(fetchPublicText("https://example.com", signal)).rejects.toThrow("caller stopped");
  });
});
