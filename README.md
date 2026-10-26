# Mitti & Co. — flower pot shop

A one-page shop selling three flower pots (₹199, ₹299, ₹399) with Razorpay checkout (UPI, cards, netbanking), hosted on Vercel.

## What's inside

| Path | What it does |
| --- | --- |
| `public/index.html` | The shop page: products, cart, delivery form, Razorpay checkout |
| `api/create-order.js` | Works out the total **on the server** and creates a Razorpay order |
| `api/verify-payment.js` | Checks Razorpay's signature so a payment can't be faked |
| `lib/products.js` | Product names and prices — the server uses these, not the browser's |

## Go live on Vercel

1. **Get Razorpay keys.** In the Razorpay Dashboard go to *Account & Settings → API Keys* and generate a key. Start in **Test mode** (keys begin with `rzp_test_`).
2. **Import the repo.** On vercel.com click *Add New → Project*, pick this GitHub repo, leave the settings as they are, and deploy.
3. **Add the keys.** In the Vercel project open *Settings → Environment Variables* and add:
   - `RAZORPAY_KEY_ID` — e.g. `rzp_test_xxxxxxxx`
   - `RAZORPAY_KEY_SECRET` — the secret shown with it

   Then go to *Deployments* and **Redeploy** so the keys take effect.
4. **Test a payment** with Razorpay's test UPI/card details. It appears under *Payments* in your Razorpay Dashboard (test mode).
5. **Go live:** finish Razorpay's KYC/activation, generate **Live** keys (`rzp_live_`), swap them into Vercel, and redeploy.

Never put the key secret in the code or commit it — it belongs only in Vercel's environment variables.

## Where to find orders

Every paid order shows up in the Razorpay Dashboard under *Payments* / *Orders*. Open one and look at **Notes**: it has the items, customer name, phone, email, address and pincode.

## Changing prices or products

Edit `lib/products.js` (the real prices) **and** the matching `PRODUCTS` list near the bottom of `public/index.html` (what customers see). Push to GitHub and Vercel redeploys automatically.
