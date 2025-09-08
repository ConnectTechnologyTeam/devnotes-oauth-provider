// /api/callback — đổi code -> token, gửi token về Decap CMS
async function exchangeCodeForToken(code, clientId, clientSecret) {
  const r = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  });
  if (!r.ok) throw new Error(`Token exchange failed: ${r.status}`);
  const data = await r.json();
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

    // URL trang admin — tuyệt đối, KHÔNG có '#' và KHÔNG cần '/' cuối
    let parentUrl = process.env.REDIRECT_URL || "https://connecttechnologyteam.github.io/devnotes/admin";
    parentUrl = parentUrl.replace(/[#?].*$/, "").replace(/\/+$/, ""); // sanitize

    const html = `<!doctype html>
<html><head><meta charset="utf-8"/></head><body>
<script>
(function () {
  var token = ${JSON.stringify(token)};
  var parentUrl = ${JSON.stringify(parentUrl)};

  // Gửi cho Decap theo cả 2 format
  function send() {
    try { window.opener && window.opener.postMessage('authorization:github:' + JSON.stringify({token: token}), '*'); } catch(_){}
    try { window.opener && window.opener.postMessage('authorization:github:' + token, '*'); } catch(_){}
  }
  send();
  var i=0, iv=setInterval(function(){ send(); if(++i>=10) clearInterval(iv); }, 120);

  // Fallback cưỡng bức: điều hướng tab cha về URL có #access_token (⚠️ KHÔNG có '/')
  try {
    if (window.opener && !window.opener.closed) {
      window.opener.location = parentUrl + '#access_token=' + token + '&token_type=bearer';
    }
  } catch(_) {}

  // Đóng popup, nếu bị chặn thì điều hướng chính popup (vẫn dùng '#' không có '/')
  try { window.close(); } catch(_){}
  setTimeout(function(){
    location.replace(parentUrl + '#access_token=' + token + '&token_type=bearer');
  }, 900);
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
