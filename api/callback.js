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

    const id = process.env.OAUTH_CLIENT_ID;
    const secret = process.env.OAUTH_CLIENT_SECRET;
    if (!id || !secret) return res.status(500).send("Missing OAUTH envs");

    const token = await exchangeCodeForToken(code, id, secret);

    // Trang admin để fallback nếu không đóng được popup (không chèn # ở đây)
    let adminUrl = process.env.REDIRECT_URL || "https://connecttechnologyteam.github.io/devnotes/admin";
    adminUrl = adminUrl.replace(/[#?].*$/, "").replace(/\/+$/, "");

    const html = `<!doctype html>
<html><head><meta charset="utf-8"/></head><body>
<script>
(function () {
  var token = ${JSON.stringify(token)};
  // 3 format mà Decap/Netlify CMS từng lắng nghe
  var m1 = 'authorization:github:' + JSON.stringify({ token: token, provider: 'github' });
  var m2 = 'authorization:github:' + JSON.stringify({ token: token });
  var m3 = 'authorization:github:' + token;

  function sendAll(){
    try { window.opener && window.opener.postMessage(m1, '*'); } catch(_) {}
    try { window.opener && window.opener.postMessage(m2, '*'); } catch(_) {}
    try { window.opener && window.opener.postMessage(m3, '*'); } catch(_) {}
  }

  // bắn liên tục ~3 giây để chắc listener nhận được
  sendAll();
  var n = 0, iv = setInterval(function(){ sendAll(); if(++n>=25) clearInterval(iv); }, 120);

  // cố gắng đóng popup; nếu bị chặn, quay về trang admin (không chèn hash)
  try { window.close(); } catch(_) {}
  setTimeout(function(){ location.replace(${JSON.stringify(adminUrl)}); }, 2000);
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
