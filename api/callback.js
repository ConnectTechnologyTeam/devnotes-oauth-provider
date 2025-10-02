// /api/callback.js
const getCookie = (req, name) => {
  const raw = req.headers.cookie || "";
  const m = raw
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + "="));
  return m ? decodeURIComponent(m.split("=").slice(1).join("")) : "";
};
const clearCookies = (res, names) => {
  res.setHeader(
    "Set-Cookie",
    names.map((n) => `${n}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`)
  );
};

module.exports = async (req, res) => {
  try {
    const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET } = process.env;
    const { code, state } = req.query || {};
    if (!code || !state) return res.status(400).send("Missing code/state");

    const expected = getCookie(req, "oauth_state");
    const return_to = getCookie(req, "return_to");
    const code_verifier = getCookie(req, "pkce_verifier");
    if (!expected || state !== expected)
      return res.status(400).send("Invalid state");
    if (!return_to) return res.status(400).send("Missing return_to");
    if (!code_verifier) return res.status(400).send("Missing code_verifier");

    const callback = `https://${req.headers.host}/api/callback`;
    const resp = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: callback,
        code_verifier,
        grant_type: "authorization_code",
      }),
    });
    const payload = await resp.json();
    if (!resp.ok || !payload.access_token)
      return res.status(502).send("Token exchange failed");

    clearCookies(res, ["oauth_state", "return_to", "pkce_verifier"]);

    const back = new URL(return_to);
    back.hash = new URLSearchParams({
      access_token: payload.access_token,
      token_type: payload.token_type || "bearer",
      scope: payload.scope || "",
    }).toString();

    res.writeHead(302, { Location: back.toString() }).end();
  } catch (e) {
    res.status(500).send("Auth failed");
  }
};
