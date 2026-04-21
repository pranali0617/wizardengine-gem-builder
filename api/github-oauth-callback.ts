import {
  clearStateCookie,
  exchangeGitHubCodeForToken,
  fetchGitHubViewer,
  inferAppOrigin,
  readCookie,
} from '../lib/github-auth.js';

function renderCallbackHtml(payload: { token: string; login: string; avatarUrl?: string } | null, error?: string) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>GitHub Connect</title>
    <style>
      body { font-family: sans-serif; background: #f8fafc; color: #0f172a; display: grid; place-items: center; min-height: 100vh; margin: 0; }
      .card { background: white; border-radius: 18px; padding: 24px; box-shadow: 0 18px 48px rgba(15, 23, 42, 0.12); width: min(420px, calc(100vw - 32px)); }
      .title { font-size: 18px; font-weight: 600; margin: 0 0 8px; }
      .text { font-size: 14px; line-height: 1.6; color: #475569; }
    </style>
  </head>
  <body>
    <div class="card">
      <p class="title">${error ? 'GitHub connection failed' : 'GitHub connected'}</p>
      <p class="text">${error ? error : 'You can close this window and continue in the app.'}</p>
    </div>
    <script>
      (function() {
        const payload = ${JSON.stringify(payload)};
        const error = ${JSON.stringify(error || '')};
        if (window.opener) {
          window.opener.postMessage(
            error
              ? { type: 'github-oauth-error', error }
              : { type: 'github-oauth-success', payload },
            window.location.origin
          );
          setTimeout(() => window.close(), 300);
        }
      })();
    </script>
  </body>
</html>`;
}

export default async function handler(req: any, res: any) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).send(renderCallbackHtml(null, 'Missing GitHub OAuth environment variables.'));
  }

  const origin = inferAppOrigin(req.headers || {});
  const secure = origin.startsWith('https://');
  const redirectUri = `${origin}/api/github-oauth-callback`;
  const code = String(req.query?.code || '');
  const state = String(req.query?.state || '');
  const storedState = readCookie(req.headers?.cookie, 'github_oauth_state');

  res.setHeader('Set-Cookie', clearStateCookie(secure));

  if (!code || !state || !storedState || state !== storedState) {
    return res.status(400).send(renderCallbackHtml(null, 'GitHub OAuth state validation failed.'));
  }

  try {
    const token = await exchangeGitHubCodeForToken({
      clientId,
      clientSecret,
      code,
      redirectUri,
    });
    const viewer = await fetchGitHubViewer(token);

    res.send(
      renderCallbackHtml({
        token,
        login: viewer.login,
        avatarUrl: viewer.avatar_url,
      }),
    );
  } catch (error: any) {
    res.status(500).send(renderCallbackHtml(null, error?.message || 'GitHub OAuth failed.'));
  }
}
