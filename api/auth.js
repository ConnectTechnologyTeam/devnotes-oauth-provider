// /api/auth.js
const crypto = require("crypto");

const b64url = (buf) =>
  buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const codeChallenge = (verifier) =>
  b64url(crypto.createHash("sha256").update(verifier).digest());

module.exports = (req, res) => {
  const {
    GITHUB_CLIENT_ID,
    OAUTH_SCOPE = "read:user",
    ALLOWED_RETURN_TO = "",
  } = process.env;
  const { return_to } = req.query || {};
  if (!return_to) return res.status(400).send("Missing return_to");

  // Allowlist origins
  let ok = false;
  try {
    const origin = new URL(return_to).origin;
    ok = ALLOWED_RETURN_TO.split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .includes(origin);
  } catch {}
  if (!ok) return res.status(400).send("return_to not allowed");

  // CSRF + PKCE
  const state = b64url(crypto.randomBytes(24));
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = codeChallenge(verifier);

  // Short-lived cookies
  res.setHeader("Set-Cookie", [
    `oauth_state=${encodeURIComponent(
      state
    )}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=300`,
    `return_to=${encodeURIComponent(
      return_to
    )}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=300`,
    `pkce_verifier=${encodeURIComponent(
      verifier
    )}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=300`,
  ]);

  const callback = `https://${req.headers.host}/api/callback`;
  const auth = new URL("https://github.com/login/oauth/authorize");
  auth.searchParams.set("client_id", GITHUB_CLIENT_ID);
  auth.searchParams.set("redirect_uri", callback);
  auth.searchParams.set("scope", OAUTH_SCOPE);
  auth.searchParams.set("state", state);
  auth.searchParams.set("code_challenge", challenge);
  auth.searchParams.set("code_challenge_method", "S256");

  res.writeHead(302, { Location: auth.toString() }).end();
};
