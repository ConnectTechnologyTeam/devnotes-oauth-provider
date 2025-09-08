// /api/auth — redirect 302 sang GitHub OAuth
export default async function handler(req, res) {
  try {
    const clientId = process.env.OAUTH_CLIENT_ID;
    if (!clientId) return res.status(500).send("Missing OAUTH_CLIENT_ID");

    const proto = (req.headers["x-forwarded-proto"] || "https").toString().split(",")[0];
    const host  = (req.headers["x-forwarded-host"]  || req.headers.host).toString().split(",")[0];
    const base  = `${proto}://${host}`;
    const redirectUri = `${base}/api/callback`;

    const scope = (req.query.scope || "repo user:email").toString().replace(/\s+/g, " ");
    const state = Math.random().toString(36).slice(2);

    const url =
      `https://github.com/login/oauth/authorize` +
      `?client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(scope)}` +
      `&state=${encodeURIComponent(state)}`;

    res.writeHead(302, { Location: url });
    res.end();
  } catch (e) {
    console.error("auth error:", e);
    res.status(500).send("Auth init failed");
  }
}
