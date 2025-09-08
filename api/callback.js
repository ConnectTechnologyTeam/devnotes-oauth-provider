// /api/callback — Exchange ?code for token, then deliver to Decap CMS
async function exchangeCodeForToken(code, clientId, clientSecret) {
  const resp = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": "decap-oauth-provider"
    },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code })
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

    // Admin URL (parent tab). Dùng absolute, KHÔNG có dấu '/' cuối, KHÔNG có '#'
    let parentUrl = process.env.REDIRECT_URL || "https://connecttechnologyteam.github.io/devnotes/admin";
    parentUrl = parentUrl.replace(/[#?].*$/, "").replace(/\/+$/, ""); // sanitize

    const html = `<!doctype html>
<html><head><meta charset="utf-8"/></head><body>
<script>
(function () {
  var token = ${JSON.stringify(token)};
  var parentUrl = ${JSON.stringify(parentUrl)};

  // 1) Gửi postMessage theo cả 2 định dạng, lặp lại vài lần để chắc chắn listener nhận được
  function sendMessages() {
    var msgJson = 'authorization:github:' + JSON.stringify({ token: token });
    var msgRaw  = 'authorization:github:' + token;
    try { window.opener && window.opener.postMessage(msgJson, '*'); } catch(_) {}
    try { window.opener && window.opener.postMessage(msgRaw,  '*'); } catch(_) {}
  }
  var tries = 0;
  var iv = setInterval(function(){ sendMessages(); if(++tries >= 12){ clearInterval(iv); } }, 120);
  // gửi ngay 1 phát
  sendMessages();

  // 2) Fallback cưỡng bức: điều hướng tab cha về URL có #access_token=... (đúng format)
  try {
    if (window.opener && !window.opener.closed) {
      window.opener.location = parentUrl + '/#access_token=' + token + '&token_type=bearer';
    }
  } catch(_) {}

  // 3) Đóng popup; nếu bị chặn, 1s sau tự điều hướng chính popup về URL fallback
  try { window.close(); } catch(_) {}
  setTimeout(function(){
    location.replace(parentUrl + '/#access_token=' + token + '&token_type=bearer');
  }, 1000);
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
