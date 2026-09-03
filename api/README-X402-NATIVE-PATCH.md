# BEKX x402 Vercel-native gate patch

Replace the existing `api/signal-agent.js` with this file.

This version does not use the Express adapter. It speaks the x402 V2 HTTP
wire format directly, which is appropriate for a native Vercel serverless
function.

Expected test:
- GET `/api/signal-agent` -> 200 metadata
- Unpaid POST -> 402 with `PAYMENT-REQUIRED` header
- POST with any `PAYMENT-SIGNATURE` -> 501 until facilitator verification
  and settlement are added (fail-closed by design)

Testnet only. No testnet funds count as BEKX revenue.
