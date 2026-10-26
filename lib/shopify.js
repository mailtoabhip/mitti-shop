// Creates a paid order in the Mitti & Co. Shopify store for a Razorpay payment.
// Uses a Shopify Dev Dashboard app with the client credentials grant:
//   SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET  (Vercel environment variables)
//   SHOPIFY_STORE_DOMAIN (optional, defaults to the Mitti & Co. store)
const { PRODUCTS } = require("./products");

const API_VERSION = "2026-10";
const storeDomain = () => process.env.SHOPIFY_STORE_DOMAIN || "ebng2g-sw.myshopify.com";

let cachedToken = null; // { token, expiresAt }

function isConfigured() {
  return Boolean(process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET);
}

async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  const res = await fetch(`https://${storeDomain()}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.SHOPIFY_CLIENT_ID,
      client_secret: process.env.SHOPIFY_CLIENT_SECRET,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`Shopify token request failed (${res.status}): ${JSON.stringify(data).slice(0, 300)}`);
  }
  cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 86399) * 1000 };
  return cachedToken.token;
}

async function shopifyGraphQL(query, variables) {
  const token = await getAccessToken();
  const res = await fetch(`https://${storeDomain()}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.errors) {
    throw new Error(`Shopify API error (${res.status}): ${JSON.stringify(data.errors || data).slice(0, 500)}`);
  }
  return data.data;
}

// "petite:1,grand:2" -> [{ variantId, quantity }]
function parseCart(cartNote) {
  const lines = [];
  for (const part of String(cartNote || "").split(",")) {
    const [id, qtyStr] = part.split(":");
    const product = PRODUCTS[id];
    const quantity = parseInt(qtyStr, 10);
    if (product && quantity > 0) lines.push({ variantId: product.shopifyVariantId, quantity });
  }
  return lines;
}

// Indian numbers to E.164 (+91XXXXXXXXXX); anything else is left out rather than failing the order.
function toE164(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 10) return "+91" + digits;
  if (digits.length === 12 && digits.startsWith("91")) return "+" + digits;
  return null;
}

/**
 * @param {object} rzpOrder   Razorpay order entity (has notes from create-order)
 * @param {object} rzpPayment Razorpay payment entity
 * @returns {Promise<{created:boolean, name?:string, id?:string}>}
 */
async function createShopifyOrder(rzpOrder, rzpPayment) {
  const tag = `rzp-${rzpPayment.id}`;

  // Idempotency: Razorpay may deliver the same webhook more than once.
  const existing = await shopifyGraphQL(
    `query($q: String!) { orders(first: 1, query: $q) { nodes { id name } } }`,
    { q: `tag:'${tag}'` }
  );
  const found = existing.orders.nodes[0];
  if (found) return { created: false, id: found.id, name: found.name };

  const notes = rzpOrder.notes || {};
  const lineItems = parseCart(notes.cart);
  if (lineItems.length === 0) throw new Error(`No recognisable items in Razorpay order ${rzpOrder.id}`);

  const [firstName, ...rest] = String(notes.customer_name || "Customer").trim().split(/\s+/);
  const phone = toE164(notes.customer_phone);
  const amount = (rzpPayment.amount / 100).toFixed(2);
  const isTest = String(process.env.RAZORPAY_KEY_ID || "").startsWith("rzp_test_");

  const order = {
    currency: "INR",
    financialStatus: "PAID",
    taxesIncluded: true,
    test: isTest,
    sourceName: "mitti-website",
    sourceIdentifier: rzpPayment.id,
    tags: [tag, "razorpay"],
    note: `Paid via Razorpay. Payment ${rzpPayment.id}, order ${rzpOrder.id}.`,
    lineItems,
    shippingAddress: {
      firstName,
      lastName: rest.join(" ") || "-",
      address1: String(notes.address || "").slice(0, 250),
      city: notes.city || "",
      zip: notes.pincode || "",
      countryCode: "IN",
      ...(phone ? { phone } : {}),
    },
    transactions: [
      {
        kind: "SALE",
        status: "SUCCESS",
        gateway: "Razorpay",
        authorizationCode: rzpPayment.id,
        amountSet: { shopMoney: { amount, currencyCode: "INR" } },
        test: isTest,
      },
    ],
    ...(notes.customer_email ? { email: notes.customer_email } : {}),
    ...(phone ? { phone } : {}),
  };

  const result = await shopifyGraphQL(
    `mutation($order: OrderCreateOrderInput!) {
      orderCreate(order: $order) {
        order { id name }
        userErrors { field message }
      }
    }`,
    { order }
  );
  const { userErrors, order: created } = result.orderCreate;
  if (userErrors && userErrors.length) throw new Error("Shopify orderCreate: " + JSON.stringify(userErrors));
  return { created: true, id: created.id, name: created.name };
}

module.exports = { isConfigured, createShopifyOrder, parseCart, toE164 };
