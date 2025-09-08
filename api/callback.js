// /api/callback  — Exchange ?code for token, then deliver to Decap via postMessage
async function exchangeCodeForToken(code, clientId, clientSecret) {
  const resp = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "decap-oauth-provider",
    },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Token exchange failed: ${resp.status} ${t}`);
  }
  const data = await resp.json();
  if (!data.access_token) throw new Error(`No access_token: ${JSON.stringify(data)}`);
  return data.access_token;
}

export default async function handler(req, res) {
  try {
    const code = req.query.code;
    if (!code) return res.status(400).send("Missing code");

    const clientId = process.env.OAUTH_CLIENT_ID;
    const clientSecret = process.env.OAUTH_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.status(500).send("Missing OAUTH_CLIENT_ID / OAUTH_CLIENT_SECRET");
    }

    const token = await exchangeCodeForToken(code, clientId, clientSecret);

    // Site admin URL để fallback reload nếu popup không tự đóng
    let siteUrl = process.env.REDIRECT_URL || "https://connecttechnologyteam.github.io/devnotes/admin/";
    siteUrl = siteUrl.replace(/#\/?$/, "").replace(/\/+$/, "") + "/";

    const html = `<!doctype html>
<html><head><meta charset="utf-8" /></head>
<body>
<script>
  (function () {
    try {
      // Định dạng Decap/Netlify CMS lắng nghe
      var msg = 'authorization:github:' + JSON.stringify({ token: ${JSON.stringify(token)} });
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(msg, '*');
      }
      // cố gắng đóng popup; nếu bị chặn, fallback về admin URL (không cần token trong hash)
      window.close();
      setTimeout(function(){ location.href = ${JSON.stringify(siteUrl)}; }, 600);
    } catch (e) {
      // fallback cuối: gắn token vào hash để CMS tự bắt
      location.href = ${JSON.stringify(siteUrl)} + '#access_token=' + ${JSON.stringify(token)} + '&token_type=bearer';
    }
  })();
</script>
</body></html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).end(html);
  } catch (e) {
    console.error("callback error:", e);
    res.status(500).send("OAuth callback failed");
  }
}
