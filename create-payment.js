const crypto = require("node:crypto");
const { json, method, requiredEnv, db, hashToken } = require("./_lib");

module.exports = async function handler(req, res) {
  if (!method(req, res, "POST") || !requiredEnv(res)) return;
  try {
    const { movieId, phone, network, email } = req.body || {};
    if (typeof movieId !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(movieId)) {
      return json(res, 400, { error: "Choose a valid movie." });
    }
    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
      return json(res, 400, { error: "Enter a valid email address." });
    }
    if (!["MTN", "AIRTEL"].includes(network)) return json(res, 400, { error: "Choose MTN or Airtel Money." });
    const normalizedPhone = String(phone || "").replace(/[\s()+-]/g, "");
    if (!/^(0[0-9]{9}|256[0-9]{9})$/.test(normalizedPhone)) {
      return json(res, 400, { error: "Enter a valid Ugandan mobile-money number." });
    }

    // Only allow movies present in the server database; never trust a client-supplied price.
    const movies = await db(`movies?id=eq.${encodeURIComponent(movieId)}&select=id,title,price_ugx,active&limit=1`);
    const movie = movies && movies[0];
    if (!movie || !movie.active || Number(movie.price_ugx) !== 1000) {
      return json(res, 404, { error: "This movie is not available for purchase." });
    }

    const txRef = `NENA-${crypto.randomUUID()}`;
    const accessToken = crypto.randomBytes(32).toString("hex");
    await db("orders", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify([{
        tx_ref: txRef,
        movie_id: movie.id,
        movie_title: movie.title,
        amount_ugx: 1000,
        currency: "UGX",
        customer_email: email,
        customer_phone: normalizedPhone,
        status: "pending",
        access_token_hash: hashToken(accessToken)
      }])
    });

    const phoneNumber = normalizedPhone.startsWith("256")
      ? normalizedPhone
      : "256" + normalizedPhone.slice(1);
    const response = await fetch("https://api.flutterwave.com/v3/charges?type=mobile_money_uganda", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        phone_number: phoneNumber,
        network,
        amount: 1000,
        currency: "UGX",
        email,
        tx_ref: txRef,
        redirect_url: `${(process.env.SITE_URL || `https://${req.headers.host}`).replace(/\/$/, "")}/?payment=return`,
        fullname: "NENAFILMS Customer",
        meta: { movie_id: movie.id, site: "NENAFILMS" }
      })
    });
    const result = await response.json();
    if (!response.ok || result.status !== "success") {
      await db(`orders?tx_ref=eq.${encodeURIComponent(txRef)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ status: "failed" })
      });
      return json(res, 502, { error: "Payment could not be started. Check the number and try again." });
    }
    const redirectUrl = result.meta?.authorization?.redirect;
    if (!redirectUrl || !redirectUrl.startsWith("https://")) {
      return json(res, 502, { error: "The payment provider did not return a valid payment page." });
    }
    return json(res, 200, { txRef, accessToken, redirectUrl });
  } catch (e) {
    console.error("create-payment failed:", e.message);
    return json(res, 500, { error: "Could not create payment. Check server setup and try again." });
  }
};