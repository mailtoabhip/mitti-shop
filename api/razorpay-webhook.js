// POST /api/razorpay-webhook
// Razorpay calls this when an order is paid (event: order.paid).
// It checks Razorpay's signature, then creates the matching paid order in Shopify.
// Needs RAZORPAY_WEBHOOK_SECRET (the secret you type when creating the webhook in Razorpay).
const crypto = require("crypto");
const shopify = require("../lib/shopify");

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function fetchRazorpayOrder(orderId) {
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
  const r = await fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: "Basic " + auth },
  });
  if (!r.ok) throw new Error(`Razorpay order fetch failed (${r.status})`);
  return r.json();
}

async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return res.status(500).json({ error: "Webhook secret not configured" });

  const raw = await readRawBody(req);
  const signature = String(req.headers["x-razorpay-signature"] || "");
  const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const ok =
    signature.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  if (!ok) return res.status(400).json({ error: "Invalid signature" });

  let event;
  try {
    event = JSON.parse(raw.toString("utf8"));
  } catch {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  // Only paid orders create Shopify orders; acknowledge everything else.
  if (event.event !== "order.paid" && event.event !== "payment.captured") {
    return res.status(200).json({ ignored: event.event });
  }

  if (!shopify.isConfigured()) {
    console.warn("Shopify not configured; skipping order sync for", event.event);
    return res.status(200).json({ skipped: "shopify not configured" });
  }

  try {
    const payment = event.payload && event.payload.payment && event.payload.payment.entity;
    if (!payment || !payment.order_id) return res.status(200).json({ ignored: "no order on payment" });
    let order = event.payload.order && event.payload.order.entity;
    if (!order || !order.notes || !order.notes.cart) order = await fetchRazorpayOrder(payment.order_id);

    const result = await shopify.createShopifyOrder(order, payment);
    console.log("Shopify order", result.created ? "created" : "already existed", result.name, "for", payment.id);
    return res.status(200).json(result);
  } catch (e) {
    // A non-2xx response makes Razorpay retry later; the Shopify step is idempotent.
    console.error("Shopify sync failed:", e.message);
    return res.status(500).json({ error: "Shopify sync failed" });
  }
}

module.exports = handler;
// Keep the body unparsed so the signature can be checked against the exact bytes Razorpay sent.
module.exports.config = { api: { bodyParser: false } };
