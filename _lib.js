const crypto = require("node:crypto");

function json(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8").send(JSON.stringify(body));
}
function method(req, res, expected) {
  if (req.method !== expected) {
    res.setHeader("Allow", expected);
    json(res, 405, { error: "Method not allowed" });
    return false;
  }
  return true;
}
function requiredEnv(res) {
  const names = ["FLW_SECRET_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length) {
    json(res, 500, { error: "Server setup incomplete. Missing environment variables: " + missing.join(", ") });
    return false;
  }
  return true;
}
function supabaseHeaders(extra = {}) {
  return {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}
async function db(path, options = {}) {
  const root = process.env.SUPABASE_URL.replace(/\/$/, "");
  const response = await fetch(`${root}/rest/v1/${path}`, {
    ...options,
    headers: supabaseHeaders(options.headers || {}),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${text.slice(0, 300)}`);
  return data;
}
function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
module.exports = { json, method, requiredEnv, db, hashToken };
