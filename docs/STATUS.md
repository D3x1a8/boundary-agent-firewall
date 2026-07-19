# Operational status

Verified 2026-07-20:

- Source: typecheck and build pass; 22 tests pass.
- Browser: live scan flow verified at desktop and 390-pixel mobile widths.
- Container: Node 22 image builds, passes health, and emits an x402 challenge.
- Wallet: `0x53B290d5f35A68cD86E45C16D91D75229f6fD179` on Base; 0 USDC and 0 ETH verified at Base block 48,849,705.
- Payment: testnet challenge advertises $0.01 USDC on Base Sepolia to the exact wallet above.
- Linux: `boundary.service` is enabled and active on `aws-bot`, listening on port 8787 under a dedicated user.
- Isolation: systemd security exposure score is 2.8 (`OK`); memory is capped at 256 MB and CPU at 50%.
- Monitoring: a six-hour Codex heartbeat checks health and material official capability updates without mutating production.
- Replication: one read-only child auditor task exists with no wallet, funding, or deployment access.

## Activation blockers

- AWS ingress allows the existing service on 8899 but not Boundary's port 8787. The new service is reachable on the VM and over SSH, not from the public internet.
- Vercel CLI has no authenticated account in this environment.
- CDP mainnet facilitator credentials are absent.
- The wallet has no USDC or ETH.
- No registrar account or domain-management credential is available.

Public revenue begins only after authenticated public ingress and mainnet payment facilitation are configured. No claim of production revenue or wallet funding should be made before those checks pass.
