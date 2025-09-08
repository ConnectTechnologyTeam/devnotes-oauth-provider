// Vercel Serverless: /api/auth
// Returns JSON { auth_url } for Decap CMS to open GitHub OAuth popup.

function getProto(req) {
  return req.headers["x-forwarded-proto"] || "https";
}
function getHost(req) {
  return req.headers.host;
}

export default async function handler(req, res) {
  try {
    const clientId = process.env.OAUTH_CLIENT_ID;
    if (!clientId) {
      return res.status(500).json({ error: "Missing OAUTH_CLIENT_ID" });
    }

    const proto = getProto(req);
    const host = getHost(req);
    const redirectUri = `${proto}://${host}/api/callback`;

    // Optional CSRF protection via state (Decap không bắt buộc; để đơn giản không lưu cookie)
    const state = Math.random().toString(36).slice(2);

    const url =
      `https://github.com/login/oauth/authorize` +
      `?client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=repo%20user:email` +
      `&state=${encodeURIComponent(state)}`;

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.status(200).send(JSON.stringify({ auth_url: url }));
  } catch (e) {
    console.error("auth error:", e);
    return res.status(500).json({ error: "Auth init failed" });
  }
}
