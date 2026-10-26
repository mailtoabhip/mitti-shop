// POST /api/create-order
// Body: { items: { petite: 1, classic: 0, grand: 2 }, customer: { name, phone, email, address, pincode } }
// Creates a Razorpay order for the server-calculated total.
const { priceCart } = require("../lib/products");

const clean = (v, max) => String(v ?? "").trim().slice(0, max);

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    return res.status(500).json({ error: "Payments are not set up yet (missing Razorpay keys)." });
  }

  let cart;
  try {
    cart = priceCart(req.body && req.body.items);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  const c = (req.body && req.body.customer) || {};
  const customer = {
    name: clean(c.name, 100),
    phone: clean(c.phone, 20),
    email: clean(c.email, 100),
    address: clean(c.address, 250),
    city: clean(c.city, 60),
    pincode: clean(c.pincode, 10),
  };
  if (!customer.name || !/^\+?[0-9 ]{10,15}$/.test(customer.phone) || !customer.address || !customer.city || !/^[0-9]{6}$/.test(customer.pincode)) {
    return res.status(400).json({ error: "Please fill in your name, a valid phone number, address, city and 6-digit pincode." });
  }

  const summary = cart.lines.map((l) => `${l.name} x${l.qty}`).join(", ");

  try {
    const rzp = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64"),
      },
      body: JSON.stringify({
        amount: cart.total * 100, // Razorpay works in paise
        currency: "INR",
        receipt: "order_" + Date.now(),
        notes: {
          items: summary.slice(0, 256),
          // machine-readable cart, used to create the Shopify order: "petite:1,grand:2"
          cart: cart.lines.map((l) => `${l.id}:${l.qty}`).join(","),
          customer_name: customer.name,
          customer_phone: customer.phone,
          customer_email: customer.email,
          address: customer.address,
          city: customer.city,
          pincode: customer.pincode,
        },
      }),
    });
    const data = await rzp.json();
    if (!rzp.ok) {
      console.error("Razorpay order error", data);
      return res.status(502).json({ error: "Could not start the payment. Please try again." });
    }
    return res.status(200).json({
      orderId: data.id,
      amount: data.amount,
      currency: data.currency,
      keyId, // the key id is public; the secret never leaves the server
      total: cart.total,
      lines: cart.lines,
    });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: "Could not reach the payment service. Please try again." });
  }
};
