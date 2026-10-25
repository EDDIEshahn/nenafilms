const { json, method, requiredEnv, db, hashToken } = require("./_lib");

module.exports = async function handler(req, res) {
  if (!method(req, res, "POST") || !requiredEnv(res)) return;
  try {
    const { accessToken, movieId } = req.body || {};
    if (typeof accessToken !== "string" || !/^[a-f0-9]{64}$/.test(accessToken) ||
        typeof movieId !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(movieId)) {
      return json(res, 400, { error: "Invalid access request." });
    }
    const orders = await db(`orders?access_token_hash=eq.${hashToken(accessToken)}&movie_id=eq.${encodeURIComponent(movieId)}&select=status,movie_id&limit=1`);
    const order = orders && orders[0];
    if (!order) return json(res, 404, { error: "Purchase not found." });
    if (order.status !== "paid") return json(res, 202, { status: order.status, message: "Payment is not confirmed yet." });

    const movies = await db(`movies?id=eq.${encodeURIComponent(movieId)}&select=storage_path,active&limit=1`);
    const movie = movies && movies[0];
    if (!movie || !movie.active || !movie.storage_path) return json(res, 404, { error: "Movie file is not available." });

    const bucket = process.env.MOVIE_BUCKET || "paid-movies";
    const storagePath = movie.storage_path.split("/").map(encodeURIComponent).join("/");
    const root = process.env.SUPABASE_URL.replace(/\/$/, "");
    const response = await fetch(`${root}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${storagePath}`, {
      method: "POST",
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ expiresIn: 120 })
    });
    const signed = await response.json();
    if (!response.ok || !signed.signedURL) {
      console.error("signed URL failed:", JSON.stringify(signed).slice(0,300));
      return json(res, 502, { error: "Could not prepare the download. Please try again." });
    }
    const downloadUrl = signed.signedURL.startsWith("http")
      ? signed.signedURL
      : `${root}/storage/v1${signed.signedURL}`;
    return json(res, 200, { status: "paid", downloadUrl, expiresInSeconds: 120 });
  } catch (e) {
    console.error("access endpoint failed:", e.message);
    return json(res, 500, { error: "Could not check movie access." });
  }
};