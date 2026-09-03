const PAY_TO = "0x8e030f833ef93d5f703b52a59a0d635b9572f189";
const NETWORK = "eip155:84532"; // Base Sepolia
const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const AMOUNT = "10000"; // 0.01 USDC (6 decimals)

function b64json(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

function paymentRequired(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host || "www.bekx.au";
  const proto = req.headers["x-forwarded-proto"] || "https";
  const resourceUrl = `${proto}://${host}/api/signal-agent`;

  return {
    x402Version: 2,
    error: "PAYMENT-SIGNATURE header is required",
    resource: {
      url: resourceUrl,
      description: "BEKX SIGNAL machine intelligence test endpoint",
      mimeType: "application/json",
      serviceName: "BEKX SIGNAL",
      tags: ["research", "intelligence", "ai-agent", "testnet"]
    },
    accepts: [
      {
        scheme: "exact",
        network: NETWORK,
        amount: AMOUNT,
        asset: USDC_BASE_SEPOLIA,
        payTo: PAY_TO,
        maxTimeoutSeconds: 60,
        extra: {
          name: "USDC",
          version: "2"
        }
      }
    ],
    extensions: {}
  };
}

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({
      service: "BEKX SIGNAL",
      rail: "x402",
      x402Version: 2,
      mode: "TESTNET",
      network: NETWORK,
      price: "0.01 USDC",
      asset: USDC_BASE_SEPOLIA,
      payTo: PAY_TO,
      paidEndpoint: "POST /api/signal-agent",
      note: "Testnet payments do not count as BEKX revenue."
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const paymentSignature =
    req.headers["payment-signature"] ||
    req.headers["PAYMENT-SIGNATURE"];

  if (!paymentSignature) {
    const required = paymentRequired(req);
    res.setHeader("PAYMENT-REQUIRED", b64json(required));
    res.setHeader("Cache-Control", "no-store");
    return res.status(402).json(required);
  }

  // Fail closed until facilitator verification + settlement is added.
  // A client cannot bypass the paywall merely by sending any header value.
  return res.status(501).json({
    error: "payment_verification_not_enabled_yet",
    message:
      "PAYMENT-SIGNATURE received, but facilitator verification and settlement are not enabled in this test stage.",
    revenue_counts: false
  });
};
