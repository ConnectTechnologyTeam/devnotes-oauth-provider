// /api/callback — Exchange ?code for token, then deliver to Decap CMS

async function exchangeCodeForToken(code, clientId, clientSecret) {
  const resp = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "decap-oauth-provider",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Token exchange failed: ${resp.status} ${text}`);
  }

  const data = await resp.json();
  if (!data.access_token) {
    throw new Error(`No access_token in response: ${JSON.stringify(data)}`);
  }

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

    // Site admin URL (đặt trong ENV)
    let redirectUrl =
      process.env.REDIRECT_URL ||
      "https://connecttechnologyteam.github.io/devnotes/admin";

    // 🔧 sanitize: bỏ /, #/, hoặc /#/ dư ở cuối
    redirectUrl = redirectUrl
      .replace(/#\/?$/, "")
      .replace(/\/#$/, "")
      .replace(/\/+$/, "");

    // HTML trả về: gửi token qua postMessage + fallback hash
    const html = `<!doctype html>
<html><head><meta charset="utf-8" /></head>
<body>
<script>
(function () {
  var token = ${JSON.stringify(token)};
  var parentUrl = ${JSON.stringify(redirectUrl)};

  try {
    var msg = 'authorization:github:' + JSON.stringify({ token: token });
    var raw = 'authorization:github:' + token;

    if (window.opener && !window.opener.closed) {
      try { window.opener.postMessage(msg, '*'); } catch(_) {}
      try { window.opener.postMessage(raw, '*'); } catch(_) {}
    }

    // Fallback: điều hướng tab cha sang URL có #access_token
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.location = parentUrl + '#access_token=' + token + '&token_type=bearer';
      }
    } catch (_) {}

    // Đóng popup, fallback reload chính popup
    try { window.close(); } catch(_) {}
    setTimeout(function () {
      location.replace(parentUrl + '#access_token=' + token + '&token_type=bearer');
    }, 800);
  } catch (e) {
    location.replace(parentUrl + '#access_token=' + ${JSON.stringify(token)} + '&token_type=bearer');
  }
})();
</script>
</body></html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).end(html);
  } catch (e) {
    console.error("callback error:", e);
    res.status(500).send("OAuth callback failed: " + (e?.message || e));
  }
}
