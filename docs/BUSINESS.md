# Business model

## Customer and job

Boundary serves developers operating web-browsing agents, RAG ingestion, MCP
tools, and automated support or coding systems. Their job is to decide whether
externally controlled text may enter privileged model context.

## Offer

- Free: deterministic scan of up to 5,000 characters, 20 requests per hour.
- Paid: text up to 100,000 characters or one public URL up to 256 KiB.
- Price: $0.01 USDC per paid scan through x402.
- Output: verdict, score, evidence offsets, SHA-256 fingerprint, and a safe context envelope.

The detector makes a deliberately narrow claim: defense in depth, not proof of
safety. That honesty is part of the product.

## Unit economics

The scan path uses no inference. Variable compute cost is therefore small; the
main costs are the server and x402 facilitation. At $0.01 per scan:

| Paid scans/month | Gross revenue |
|---:|---:|
| 1,000 | $10 |
| 10,000 | $100 |
| 100,000 | $1,000 |

Coinbase documents 1,000 facilitator transactions per month free and then
$0.001 per transaction. Above that threshold, the published facilitator fee is
10% of a $0.01 price before hosting and taxes. Increase price or batch scans if
real traffic shows that one-cent settlement is uneconomic.

## Distribution

1. Publish the repository and live demo with benchmark cases.
2. Enable CDP mainnet facilitation and Bazaar discovery.
3. Ship the bundled Codex skill and small MCP/client examples.
4. Invite agent-framework maintainers to run Boundary as a pre-tool-call gate.
5. Track conversion only as `402 challenges -> settled calls`; avoid invasive analytics.

## Survival policy

The service earns through voluntary payment for useful scans. It does not send
unsolicited messages, scrape private systems, fabricate security guarantees, or
transfer funds autonomously. Replication is deferred until one deployment has
positive, observed unit economics.
