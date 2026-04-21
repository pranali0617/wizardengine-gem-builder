import {
  buildGitHubAuthorizeUrl,
  buildStateCookie,
  createGitHubState,
  inferAppOrigin,
} from '../lib/github-auth.js';

export default function handler(req: any, res: any) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return res.status(500).send('Missing GITHUB_CLIENT_ID');
  }

  const origin = inferAppOrigin(req.headers || {});
  const redirectUri = `${origin}/api/github-oauth-callback`;
  const state = createGitHubState();
  const secure = origin.startsWith('https://');

  res.setHeader('Set-Cookie', buildStateCookie(state, secure));
  res.redirect(buildGitHubAuthorizeUrl(clientId, redirectUri, state));
}
