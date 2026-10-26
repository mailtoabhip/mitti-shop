// The single source of truth for what you sell and what it costs.
// Prices are in rupees. Change them here and redeploy — the server always
// uses these numbers, so a customer can't edit the price in their browser.
const PRODUCTS = {
  // shopifyVariantId links each pot to its product in the Mitti & Co. Shopify store.
  petite: { name: "Petite pot", price: 1, shopifyVariantId: "gid://shopify/ProductVariant/50909089103958" },
  classic: { name: "Classic pot", price: 299, shopifyVariantId: "gid://shopify/ProductVariant/50909089202262" },
  grand: { name: "Grand pot", price: 399, shopifyVariantId: "gid://shopify/ProductVariant/50909089333334" },
};

const MAX_QTY_PER_ITEM = 20;

// Turns { petite: 2, grand: 1 } into checked line items and a total.
// Throws if anything is invalid.
function priceCart(items) {
  if (!items || typeof items !== "object") throw new Error("Cart is empty");
  const lines = [];
  let total = 0;
  for (const [id, rawQty] of Object.entries(items)) {
    const product = PRODUCTS[id];
    if (!product) throw new Error(`Unknown product: ${id}`);
    const qty = Number(rawQty);
    if (!Number.isInteger(qty) || qty < 0 || qty > MAX_QTY_PER_ITEM) {
      throw new Error(`Invalid quantity for ${id}`);
    }
    if (qty === 0) continue;
    lines.push({ id, name: product.name, qty, price: product.price, subtotal: qty * product.price });
    total += qty * product.price;
  }
  if (lines.length === 0) throw new Error("Cart is empty");
  return { lines, total };
}

module.exports = { PRODUCTS, priceCart };
