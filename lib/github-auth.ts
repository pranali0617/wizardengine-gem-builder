type GitHubViewer = {
  login: string;
  avatar_url?: string;
};

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_API_URL = 'https://api.github.com';

export function inferAppOrigin(headers: Record<string, string | string[] | undefined>) {
  const forwardedProto = headers['x-forwarded-proto'];
  const protocol =
    typeof forwardedProto === 'string'
      ? forwardedProto
      : headers.host?.toString().includes('localhost')
        ? 'http'
        : 'https';
  const host = headers['x-forwarded-host'] || headers.host;
  if (!host) {
    throw new Error('Unable to determine app host for GitHub OAuth.');
  }

  return `${protocol}://${Array.isArray(host) ? host[0] : host}`;
}

export function createGitHubState() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function buildGitHubAuthorizeUrl(clientId: string, redirectUri: string, state: string) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'repo read:user',
    state,
  });
  return `${GITHUB_AUTHORIZE_URL}?${params.toString()}`;
}

export async function exchangeGitHubCodeForToken(input: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}) {
  const response = await fetch(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      code: input.code,
      redirect_uri: input.redirectUri,
    }),
  });

  const data = (await response.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || 'Failed to exchange GitHub OAuth code.');
  }

  return data.access_token;
}

export async function fetchGitHubViewer(token: string) {
  const response = await fetch(`${GITHUB_API_URL}/user`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  const data = (await response.json()) as GitHubViewer & { message?: string };
  if (!response.ok || !data.login) {
    throw new Error(data.message || 'Failed to load GitHub user.');
  }

  return data;
}

export function readCookie(cookieHeader: string | undefined, key: string) {
  if (!cookieHeader) {
    return '';
  }

  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${key}=`))
    ?.split('=')
    .slice(1)
    .join('=') || '';
}

export function buildStateCookie(state: string, secure: boolean) {
  return `github_oauth_state=${state}; Path=/; HttpOnly; Max-Age=600; SameSite=Lax${secure ? '; Secure' : ''}`;
}

export function clearStateCookie(secure: boolean) {
  return `github_oauth_state=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax${secure ? '; Secure' : ''}`;
}
