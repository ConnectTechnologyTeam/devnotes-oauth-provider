// /api/auth.js  (Vercel Serverless)
function getProto(req) { return req.headers["x-forwarded-proto"] || "https"; }
function getHost(req)  { return req.headers.host; }

export default async function handler(req, res) {
  try {
    const clientId = process.env.OAUTH_CLIENT_ID;
    if (!clientId) return res.status(500).send("Missing OAUTH_CLIENT_ID");

    const proto = getProto(req);
    const host  = getHost(req);
    const redirectUri = `${proto}://${host}/api/callback`;
    const state = Math.random().toString(36).slice(2);

    const authUrl =
      `https://github.com/login/oauth/authorize` +
      `?client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent("repo user:email")}` +
      `&state=${encodeURIComponent(state)}`;

    // ✅ Redirect 302 sang GitHub thay vì trả JSON
    res.writeHead(302, { Location: authUrl });
    res.end();
  } catch (e) {
    console.error("auth error:", e);
    res.status(500).send("Auth init failed");
  }
}
