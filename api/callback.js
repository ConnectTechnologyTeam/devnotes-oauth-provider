// Vercel Serverless: /api/callback
// Exchanges ?code=... for access_token, then redirects back to /admin#access_token=...

async function exchangeCodeForToken(code, clientId, clientSecret) {
  const resp = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": "decap-oauth-provider",
    },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
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

async function fetchGithubUser(token) {
  const r = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "decap-oauth-provider",
      "Accept": "application/vnd.github+json",
    },
  });
  if (!r.ok) throw new Error(`GitHub /user failed: ${r.status}`);
  return r.json();
}

async function upsertLoginAudit(user, nowISO) {
  const owner = process.env.REPO_OWNER;
  const repo  = process.env.REPO_NAME;
  const path  = "data/user-logins.json";
  const token = process.env.REPO_ACCESS_TOKEN; // fine-grained PAT (content:write on repo)

  if (!owner || !repo || !token) return; // audit is optional

  const headers = {
    Authorization: `Bearer ${token}`,
    "User-Agent": "decap-oauth-audit",
    Accept: "application/vnd.github+json",
  };

  // read existing
  let sha = null;
  let current = {};
  const getRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`, { headers });
  if (getRes.status === 200) {
    const file = await getRes.json();
    sha = file.sha;
    const content = Buffer.from(file.content || "", "base64").toString("utf8");
    try { current = JSON.parse(content || "{}"); } catch { current = {}; }
  } else if (getRes.status !== 404) {
    // other errors ignore
    return;
  }

  const login = user.login;
  const prev = current[login] || { loginCount: 0 };
  current[login] = {
    name: user.name || prev.name || login,
    avatarUrl: user.avatar_url || prev.avatarUrl || "",
    loginCount: (prev.loginCount || 0) + 1,
    lastLogin: nowISO,
  };

  const newContent = Buffer.from(JSON.stringify(current, null, 2), "utf8").toString("base64");

  await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `chore(cms): update login for ${login}`,
      content: newContent,
      sha,
    }),
  });
}

export default async function handler(req, res) {
  try {
    const code = req.query.code;
    const clientId = process.env.OAUTH_CLIENT_ID;
    const clientSecret = process.env.OAUTH_CLIENT_SECRET;
    const redirectUrl = process.env.REDIRECT_URL || "/admin/"; // where CMS lives

    if (!code) return res.status(400).json({ error: "Missing code" });
    if (!clientId || !clientSecret) {
      return res.status(500).json({ error: "Missing OAUTH_CLIENT_ID/SECRET" });
    }

    // 1) exchange code -> token
    const accessToken = await exchangeCodeForToken(code, clientId, clientSecret);

    // 2) (optional) audit login -> update repo JSON
    try {
      const user = await fetchGithubUser(accessToken);
      const now = new Date().toISOString();
      await upsertLoginAudit(user, now);
    } catch (auditErr) {
      // don't block login if audit fails
      console.warn("Audit skipped:", auditErr?.message || auditErr);
    }

    // 3) redirect back to CMS with token in hash (Decap CMS expects this)
    res.writeHead(302, {
      Location: `${redirectUrl}#access_token=${accessToken}&token_type=bearer`,
    });
    res.end();
  } catch (e) {
    console.error("callback error:", e);
    // Fallback: show minimal error page
    return res
      .status(500)
      .setHeader("Content-Type", "text/html; charset=utf-8")
      .end(`<h1>OAuth Error</h1><pre>${String(e?.message || e)}</pre>`);
  }
}
