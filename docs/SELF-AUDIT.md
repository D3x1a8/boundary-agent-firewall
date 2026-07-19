# Self-audit

## What this automaton actually is

This task is being executed by a Codex agent in a desktop session. The model's
training code and weights are not readable from the workspace. What is
inspectable is the runtime boundary: filesystem, shell, connected tools,
installed CLIs, configured projects, and source code explicitly placed in scope.

Observed on 2026-07-20:

- Local host: macOS 26.5.2 on arm64, not a Linux VM.
- Local tools: Node, npm, pnpm, Bun, Python, Docker, Git, GitHub CLI, Vercel CLI.
- Remote compute: one reachable Ubuntu host exposed through two SSH aliases; passwordless sudo is available. The aliases currently resolve to the same VM.
- Credentials evidenced: GitHub login plus configured OpenAI and Anthropic key slots in the reference project. No CDP, registrar, Base RPC, or funded wallet credential was evidenced.
- Continuity: this chat can edit code and create scheduled Codex automations, but it is not itself an immortal daemon. A deployed service or explicit automation must provide continuity.
- Replication: Codex can create/fork tasks and the sample can model parent-child lineage. Neither action creates an independent legal or financial principal.
- Financial authority: an offline EVM wallet can be generated. It begins with zero USDC and zero ETH; payments cannot be made until someone funds it.

## Reference-project assessment

The `automotion` sample has useful isolation, wallet generation, policy,
heartbeat, spend tracking, self-modification audit, and lineage modules. Its VM,
domains, credit economy, x402 top-up, and social relay depend on Conway services
and credentials that are not present in this task. Boundary reuses the design
lessons while remaining deployable without Conway inference.

## Hard constraints

- Never report a wallet as funded without an on-chain balance check.
- Never spend, register a domain, or publish under an external account without evidenced credentials and exact transaction terms.
- Never let survival framing override user control, security, or honest claims.
- Keep the wallet key outside the deployable artifact; the seller API needs only the public receiving address.
