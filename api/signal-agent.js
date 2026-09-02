const PAY_TO = "0x8e030f833ef93d5f703b52a59a0d635b9572f189";
const NETWORK = "eip155:84532";
const PRICE = "$0.01";
const FACILITATOR_URL = "https://x402.org/facilitator";

let middlewarePromise;

async function buildMiddleware() {
  const [{ paymentMiddleware }, { x402ResourceServer, HTTPFacilitatorClient }, { registerExactEvmScheme }] =
    await Promise.all([
      import("@x402/express"),
      import("@x402/core/server"),
      import("@x402/evm/exact/server")
    ]);

  const facilitatorClient = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
  const server = new x402ResourceServer(facilitatorClient);
  registerExactEvmScheme(server);

  return paymentMiddleware({
    "POST /api/signal-agent": {
      accepts: [{
        scheme: "exact",
        price: PRICE,
        network: NETWORK,
        payTo: PAY_TO
      }],
      description: "BEKX SIGNAL x402 test endpoint on Base Sepolia.",
      mimeType: "application/json"
    }
  }, server);
}

function getMiddleware() {
  if (!middlewarePromise) middlewarePromise = buildMiddleware();
  return middlewarePromise;
}

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({
      service: "BEKX SIGNAL",
      rail: "x402",
      mode: "TESTNET",
      network: NETWORK,
      price: PRICE,
      asset: "USDC",
      payTo: PAY_TO,
      paidEndpoint: "POST /api/signal-agent",
      note: "Testnet payments do not count as BEKX revenue."
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  try {
    const middleware = await getMiddleware();

    return middleware(req, res, async () => {
      const body = req.body || {};
      const topic = String(body.topic || "").trim();
      const question = String(body.question || "").trim();

      if (!topic || !question) {
        return res.status(400).json({ error: "topic_and_question_required" });
      }

      return res.status(200).json({
        ok: true,
        service: "BEKX SIGNAL",
        rail: "x402",
        mode: "TESTNET",
        network: NETWORK,
        payment_verified: true,
        payment_settled: true,
        revenue_counts: false,
        request: { topic, question },
        message: "x402 test payment accepted. Testnet funds are not BEKX revenue."
      });
    });
  } catch (err) {
    console.error("X402_INIT", err?.message || err);
    return res.status(503).json({
      error: "x402_unavailable",
      detail: err?.message || "Unable to initialise x402"
    });
  }
};
