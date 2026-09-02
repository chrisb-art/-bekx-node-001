# BEKX x402 Testnet Rail

Adds `POST /api/signal-agent` protected by x402 on Base Sepolia.

- Facilitator: https://x402.org/facilitator
- Network: Base Sepolia (`eip155:84532`)
- Price: $0.01 test USDC
- Receiver: BEKX public wallet
- Testnet payments do not count as revenue.

After deployment:
- GET `/api/signal-agent` returns service metadata.
- POST without a payment should return HTTP 402.
- A compliant x402 client can pay and retry the POST.

Base mainnet comes after this test is proven, using a mainnet-capable facilitator such as Coinbase CDP.
