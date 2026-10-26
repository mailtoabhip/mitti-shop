# Mitti & Co. — flower pot shop

A one-page shop selling three flower pots (Petite ₹1, Classic ₹299, Grand ₹399). Customers pay with Razorpay (UPI, cards, netbanking). Each paid order is automatically created in the Mitti & Co. Shopify store, marked as paid, so you can fulfil and ship from Shopify. Hosted on Vercel.

## How an order flows

1. Customer fills the cart and delivery details → `api/create-order.js` checks prices **on the server** and creates a Razorpay order.
2. Customer pays in the Razorpay window → `api/verify-payment.js` checks Razorpay's signature and shows "order confirmed".
3. Razorpay sends an `order.paid` webhook → `api/razorpay-webhook.js` checks its signature and creates the paid order in Shopify (with items, address and payment ID). Repeated webhooks never create duplicates.

| Path | What it does |
| --- | --- |
| `public/index.html` | The shop page |
| `api/create-order.js` | Server-side price check + Razorpay order |
| `api/verify-payment.js` | Confirms the payment for the customer |
| `api/razorpay-webhook.js` | Razorpay → Shopify order sync |
| `lib/products.js` | Product names, prices and their Shopify variant IDs |
| `lib/shopify.js` | Shopify Admin API (client credentials) and order creation |

## Environment variables (Vercel → Settings → Environment Variables)

| Name | Where to get it |
| --- | --- |
| `RAZORPAY_KEY_ID` | Razorpay Dashboard → Account & Settings → API Keys |
| `RAZORPAY_KEY_SECRET` | Shown with the key above |
| `RAZORPAY_WEBHOOK_SECRET` | A password **you make up** when creating the webhook (step B) |
| `SHOPIFY_CLIENT_ID` | Shopify Dev Dashboard app → Settings (step C) |
| `SHOPIFY_CLIENT_SECRET` | Same place |

After adding or changing any of these, go to *Deployments* and **Redeploy**. Never put secrets in the code.

## Setup

**A. Razorpay keys.** Start in **Test mode** (`rzp_test_…`). Add the key ID and secret to Vercel.

**B. Razorpay webhook.** Razorpay Dashboard → Account & Settings → Webhooks → *Add New Webhook*:
- Webhook URL: `https://<your-vercel-domain>/api/razorpay-webhook`
- Secret: make up a long random password; put the same value in Vercel as `RAZORPAY_WEBHOOK_SECRET`
- Active events: tick **order.paid**

Test mode and Live mode have separate webhook settings — add it in both.

**C. Shopify app (lets the site create orders).** Shopify Dev Dashboard (dev.shopify.com) → *Create app* → name it "Mitti website":
- In the app's version/configuration, set Admin API access scopes: **`write_orders`, `read_orders`**, and release the version
- Install the app on the **Mitti & Co.** store (ebng2g-sw.myshopify.com)
- In *Settings*, copy the **Client ID** and **Client secret** into Vercel as `SHOPIFY_CLIENT_ID` / `SHOPIFY_CLIENT_SECRET`

**D. Test.** Buy one Petite pot (₹1) with Razorpay test details. Within a few seconds a paid **test order** appears in Shopify → Orders. If it doesn't, check Vercel → your project → Logs for "Shopify sync failed".

**E. Go live.** After Razorpay KYC, switch to Live keys in Vercel, add the webhook in Live mode, and redeploy. Live orders appear in Shopify as normal (non-test) orders.

## Changing prices or products

Edit `lib/products.js` (the real prices and Shopify variant IDs) **and** the matching `PRODUCTS` list in `public/index.html` (what customers see). Update the price in Shopify too so the two match. Push to GitHub and Vercel redeploys automatically.
