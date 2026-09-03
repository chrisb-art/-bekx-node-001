const PAY_TO = "0x8e030f833ef93d5f703b52a59a0d635b9572f189";
const NETWORK = "eip155:84532";
const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const AMOUNT = "10000"; // 0.01 USDC
const FACILITATOR = "https://x402.org/facilitator";

function b64json(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

function parseB64Json(value) {
  const raw = Buffer.from(String(value), "base64").toString("utf8");
  return JSON.parse(raw);
}

function paymentRequired(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host || "www.bekx.au";
  const proto = req.headers["x-forwarded-proto"] || "https";
  return {
    x402Version: 2,
    error: "PAYMENT-SIGNATURE header is required",
    resource: {
      url: `${proto}://${host}/api/signal-agent`,
      description: "BEKX SIGNAL machine intelligence test endpoint",
      mimeType: "application/json",
      serviceName: "BEKX SIGNAL",
      tags: ["research", "intelligence", "ai-agent", "testnet"]
    },
    accepts: [{
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
    }],
    extensions: {}
  };
}

async function callFacilitator(path, body) {
  const r = await fetch(`${FACILITATOR}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { ok: r.ok, status: r.status, json };
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
      facilitator: FACILITATOR,
      note: "Testnet payments do not count as BEKX revenue."
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const required = paymentRequired(req);
  const sigHeader = req.headers["payment-signature"];

  if (!sigHeader) {
    res.setHeader("PAYMENT-REQUIRED", b64json(required));
    res.setHeader("Cache-Control", "no-store");
    return res.status(402).json(required);
  }

  let paymentPayload;
  try {
    paymentPayload = parseB64Json(sigHeader);
  } catch {
    return res.status(400).json({ error: "invalid_payment_signature_header" });
  }

  const accepted = required.accepts[0];

  if (
    paymentPayload?.x402Version !== 2 ||
    paymentPayload?.accepted?.scheme !== accepted.scheme ||
    paymentPayload?.accepted?.network !== accepted.network ||
    paymentPayload?.accepted?.amount !== accepted.amount ||
    String(paymentPayload?.accepted?.asset || "").toLowerCase() !== accepted.asset.toLowerCase() ||
    String(paymentPayload?.accepted?.payTo || "").toLowerCase() !== accepted.payTo.toLowerCase()
  ) {
    return res.status(400).json({ error: "payment_requirements_mismatch" });
  }

  const envelope = {
    x402Version: 2,
    paymentPayload,
    paymentRequirements: accepted
  };

  const verify = await callFacilitator("/verify", envelope);
  if (!verify.ok || verify.json?.isValid !== true) {
    return res.status(402).json({
      error: "payment_verification_failed",
      facilitator_status: verify.status,
      detail: verify.json
    });
  }

  const body = req.body || {};
  const topic = String(body.topic || "").trim();
  const question = String(body.question || "").trim();

  if (!topic || !question) {
    return res.status(400).json({ error: "topic_and_question_required" });
  }

  // Protected resource executes only after verify succeeds.
  const result = {
    ok: true,
    service: "BEKX SIGNAL",
    mode: "TESTNET",
    payment_verified: true,
    request: { topic, question },
    message: "BEKX SIGNAL test resource executed after x402 verification."
  };

  const settle = await callFacilitator("/settle", envelope);
  if (!settle.ok || settle.json?.success !== true) {
    return res.status(502).json({
      error: "payment_settlement_failed",
      facilitator_status: settle.status,
      detail: settle.json
    });
  }

  res.setHeader("PAYMENT-RESPONSE", b64json(settle.json));
  res.setHeader("Cache-Control", "no-store");

  return res.status(200).json({
    ...result,
    payment_settled: true,
    revenue_counts: false,
    settlement: {
      payer: settle.json?.payer || verify.json?.payer || null,
      transaction: settle.json?.transaction || "",
      network: settle.json?.network || NETWORK
    }
  });
};
