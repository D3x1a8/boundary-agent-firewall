# Deployment

## Local

```bash
cp .env.example .env
npm ci
npm test
npm run build
npm start
```

The free endpoint is usable with `X402_MODE=disabled` outside production.

## Create the receiving wallet

Choose an explicit private path outside the deployable project:

```bash
BOUNDARY_WALLET_PATH=/secure/path/boundary-wallet.json npm run wallet:create
```

Back up the resulting `0600` file offline. Put only its public address in
`X402_PAY_TO`. The API server does not need the private key.

## Testnet payment challenge

Set `NODE_ENV=production`, `X402_MODE=testnet`, `X402_PAY_TO` to the receiving
address, and `X402_PRICE=$0.01`. This uses the signup-free x402.org facilitator
and Base Sepolia. Verify an unpaid POST returns `402` plus `PAYMENT-REQUIRED`
before testing settlement.

## Mainnet

Set `X402_MODE=mainnet`, a funded receiving address, and CDP API credentials.
Mainnet uses Base (`eip155:8453`) and the Coinbase facilitator configuration.
Verify the exact payee, price, and network in the challenge before announcing
the endpoint.

## Container

```bash
docker compose up -d --build
docker compose logs -f
```

The container is read-only, drops Linux capabilities, has no wallet key, and
binds only to loopback for use behind a TLS reverse proxy.
