// /api/callback — exchange code -> token, deliver via postMessage (robust with strict origin)
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

    let adminUrl = process.env.REDIRECT_URL || "https://connecttechnologyteam.github.io/devnotes/admin";
    adminUrl = adminUrl.replace(/[#?].*$/, '').replace(/\/+$/, '');

    const PARENT_ORIGIN = "https://connecttechnologyteam.github.io";

    const html = `<!doctype html><meta charset=\"utf-8\"><body><script>
(function () {
  var token = ${JSON.stringify(token)};
  var m1 = 'authorization:github:' + JSON.stringify({ token: token, provider: 'github' });
  var m2 = 'authorization:github:' + JSON.stringify({ token: token });
  var m3 = 'authorization:github:' + token;
  function sendAll(){
    try { window.opener && window.opener.postMessage(m1, '${PARENT_ORIGIN}'); } catch(_) {}
    try { window.opener && window.opener.postMessage(m2, '${PARENT_ORIGIN}'); } catch(_) {}
    try { window.opener && window.opener.postMessage(m3, '${PARENT_ORIGIN}'); } catch(_) {}
  }
  sendAll();
  var n=0, iv=setInterval(function(){ sendAll(); if(++n>=25) clearInterval(iv); }, 120);
  try { window.opener && (window.opener.location.href = '${adminUrl}/#/'); } catch(_) {}
  try { window.close(); } catch(_) {}
  setTimeout(function(){ location.replace('${adminUrl}'); }, 2000);
})();
</script></body>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).end(html);
  } catch (e) {
    console.error('callback error:', e);
    res.status(500).send('OAuth callback failed');
  }
}
