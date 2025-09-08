// /api/callback — robust: send multiple postMessage formats + hard redirect fallback
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
  if (!resp.ok) throw new Error(`Token exchange failed: ${resp.status}`);
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

    // Admin URL (parent tab) — nên để absolute
    let siteUrl = process.env.REDIRECT_URL || "https://connecttechnologyteam.github.io/devnotes/admin/";
    siteUrl = siteUrl.replace(/#\/?$/, "").replace(/\/+$/, "") + "/";

    const html = `<!doctype html>
<html><head><meta charset="utf-8" /></head>
<body>
<script>
(function () {
  try {
    var token = ${JSON.stringify(token)};
    var parentUrl = ${JSON.stringify(siteUrl)};

    // 1) Tất cả định dạng postMessage từng được Decap/Netlify CMS hỗ trợ
    var msgJson = 'authorization:github:' + JSON.stringify({ token: token });
    var msgRaw  = 'authorization:github:' + token; // một số bản cũ dùng format này

    if (window.opener && !window.opener.closed) {
      try { window.opener.postMessage(msgJson, '*'); } catch(_) {}
      try { window.opener.postMessage(msgRaw,  '*'); } catch(_) {}
    }

    // 2) Cưỡng bức điều hướng tab cha về URL có #access_token (cross-origin NAV được phép)
    //    Nếu postMessage không được lắng nghe thì Decap vẫn nhận token qua hash.
    try { if (window.opener && !window.opener.closed) { window.opener.location = parentUrl + '#access_token=' + token + '&token_type=bearer'; } } catch (_) {}

    // 3) Đóng popup (nếu browser chặn, thì sau 800ms tự điều hướng fallback tại chính popup)
    try { window.close(); } catch(_) {}
    setTimeout(function () {
      location.replace(parentUrl + '#access_token=' + token + '&token_type=bearer');
    }, 800);
  } catch (e) {
    // Fallback cuối
    location.replace(${JSON.stringify(siteUrl)} + '#access_token=' + ${JSON.stringify(token)} + '&token_type=bearer');
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
