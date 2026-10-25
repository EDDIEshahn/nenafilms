# NENAFILMS automatic payments — integration scaffold

This version adds Vercel serverless API endpoints for Flutterwave Uganda mobile-money collection and Supabase order/storage records.

## Important before launch

This is an integration scaffold, not a guarantee of a ready-to-sell service. It needs a real Flutterwave merchant account with Uganda mobile money enabled, a Supabase project, environment variables, and end-to-end sandbox testing. Do not use real customer payments until testing and provider approval are complete.

The current visual catalogue (`movies.js`) is a sample static list. Paid movies must also exist in the Supabase `movies` table with a matching `id`. The private storage `storage_path` must point to an actual file. You must build an authenticated admin interface before uploading real content; do not put full movie files in GitHub.

## 1. Set up Flutterwave

1. Create a merchant account with Flutterwave and complete the onboarding/KYC steps it requests.
2. Confirm Uganda mobile-money collections in UGX are enabled for your account.
3. Start in test mode and copy the test secret key.
4. In the Flutterwave dashboard, configure a webhook URL after deployment:
   `https://YOUR-VERCEL-DOMAIN.vercel.app/api/flutterwave-webhook`
5. Set a strong random webhook secret hash in the dashboard and copy the same value to Vercel as `FLW_SECRET_HASH`.
6. Confirm the exact v3 API, webhook signature format and Uganda mobile-money settings with current provider docs before live use. The included webhook uses the documented v3 `verif-hash` header and re-verifies each transaction through the transaction verification API.

Docs:
- Uganda mobile money: https://developer.flutterwave.com/docs/uganda
- Webhooks: https://developer.flutterwave.com/docs/webhooks
- Transaction verification: https://developer.flutterwave.com/docs/transaction-verification

The payment prompt asks the customer for their own number and network so the provider can request their authorization. The recipient settlement account is configured through your merchant/provider account; this API does not guarantee settlement to the personal number `0763827011`. Ask the provider whether your intended business settlement account can be configured. Do not tell customers to send their mobile-money PIN or OTP to you.

## 2. Set up Supabase

1. Create a Supabase project: https://supabase.com/
2. Open SQL Editor and run `supabase/schema.sql`.
3. In Storage, create a **private** bucket called `paid-movies`.
4. Do not add public read policies for paid movie files.
5. Create a movie row with the movie ID used by the website, a price of 1000, a `storage_path`, and `active=true` only after the file is ready. The example row is inactive by default.

## 3. Configure Vercel environment variables

In Vercel → Project → Settings → Environment Variables, set:
- `FLW_SECRET_KEY` — test key for test environment, live key only after approval and testing
- `FLW_SECRET_HASH` — same webhook secret configured with Flutterwave
- `SUPABASE_URL` — project URL
- `SUPABASE_SERVICE_ROLE_KEY` — service-role key (server only; NEVER use in browser code)
- `SITE_URL` — deployed HTTPS site URL
- `MOVIE_BUCKET` — `paid-movies`

Redeploy after setting variables. Never commit `.env` files or real keys to GitHub.

## 4. API endpoints

- `POST /api/create-payment` — body `{ "movieId":"licensed-film-001", "phone":"0771234567", "network":"MTN", "email":"customer@example.com" }`. Server sets the amount to UGX 1,000, creates a unique reference and initiates the provider charge.
- `POST /api/flutterwave-webhook` — verifies the configured webhook hash, then verifies the transaction with Flutterwave before marking the order paid.
- `POST /api/access` — body `{ "accessToken":"token-returned-by-create-payment", "movieId":"licensed-film-001" }`. Returns a short-lived signed URL only if that exact order is paid.

The browser must keep the access token returned by `create-payment` and pass it to `/api/access` after the provider returns. Do not put the access token or any secret in public movie catalogue data. A front-end checkout/purchase interface still needs to be connected to these endpoints and tested against your provider's actual responses before public launch.

## 5. Deploy on Vercel

Import the repository as a Vercel project. Keep `index.html`, `style.css`, `movies.js` and `app.js` at the root. Vercel will deploy files in `/api` as serverless functions. Add environment variables and redeploy.

## 6. Security and production checklist

- Use test keys first and verify success, pending, failed, duplicate webhook and mismatched-amount cases.
- Never trust a browser success page; only the server webhook plus transaction verification marks an order paid.
- Never put full movie files or secrets in GitHub.
- Keep Supabase Storage private; issue short-lived signed URLs only after purchase checks.
- Protect the future admin dashboard with authentication and admin-only database/storage permissions.
- Add rate limits, order expiration/cleanup, alerting, backups, and a transaction reconciliation job before launch.
- Do not expose private download URLs in public `movies.js`.
- Only distribute movies you own or have permission to distribute.
