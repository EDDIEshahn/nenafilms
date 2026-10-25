const crypto = require("node:crypto");
const { json, method, requiredEnv, db } = require("./_lib");

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const aa = Buffer.from(a), bb = Buffer.from(b);
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
module.exports = async function handler(req, res) {
  if (!method(req, res, "POST") || !requiredEnv(res)) return;
  const configured = process.env.FLW_SECRET_HASH;
  if (!configured || !safeEqual(req.headers["verif-hash"], configured)) {
    return json(res, 401, { error: "Invalid webhook signature." });
  }
  try {
    const event = req.body || {};
    const data = event.data || {};
    if (!data.id || !data.tx_ref) return json(res, 200, { received: true });

    // Never grant access from a webhook payload alone: verify with Flutterwave's API.
    const verifyResponse = await fetch(`https://api.flutterwave.com/v3/transactions/${encodeURIComponent(data.id)}/verify`, {
      headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}` }
    });
    const verified = await verifyResponse.json();
    const tx = verified.data;
    if (!verifyResponse.ok || verified.status !== "success" || !tx) {
      return json(res, 400, { error: "Could not verify transaction." });
    }

    const orders = await db(`orders?tx_ref=eq.${encodeURIComponent(String(tx.tx_ref))}&select=tx_ref,movie_id,amount_ugx,currency,status&limit=1`);
    const order = orders && orders[0];
    if (!order) return json(res, 200, { received: true });
    const valid = tx.status === "successful"
      && String(tx.tx_ref) === order.tx_ref
      && String(tx.currency).toUpperCase() === order.currency
      && Number(tx.amount) >= Number(order.amount_ugx);

    const nextStatus = valid ? "paid" : (["failed", "cancelled"].includes(String(tx.status).toLowerCase()) ? "failed" : "pending");
    // Idempotent: repeat notifications set the same state, never create a second order.
    if (order.status !== "paid") {
      await db(`orders?tx_ref=eq.${encodeURIComponent(order.tx_ref)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ status: nextStatus, flutterwave_transaction_id: String(tx.id) })
      });
    }
    return json(res, 200, { received: true });
  } catch (e) {
    console.error("webhook failed:", e.message);
    return json(res, 500, { error: "Webhook processing failed." });
  }
};