import { Buffer } from 'node:buffer';
import { WizardConfig } from './wizard-backend.js';

const GITHUB_API = 'https://api.github.com';
const HEADERS = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
};

type GitHubRequestOptions = {
  token: string;
  method?: string;
  path: string;
  body?: unknown;
};

type RepoParts = {
  owner: string;
  repo: string;
};

export type GitHubPublishPayload = {
  token: string;
  repo: string;
  baseBranch: string;
  branch: string;
  message: string;
  config: WizardConfig;
};

function parseRepo(input: string): RepoParts {
  const trimmed = input.trim().replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '');
  const [owner, repo] = trimmed.split('/');
  if (!owner || !repo) {
    throw new Error('Repository must look like owner/repo.');
  }
  return { owner, repo };
}

async function githubRequest<T>({ token, method = 'GET', path, body }: GitHubRequestOptions): Promise<T> {
  const response = await fetch(`${GITHUB_API}${path}`, {
    method,
    headers: {
      ...HEADERS,
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    let message = `GitHub request failed (${response.status})`;
    try {
      const parsed = JSON.parse(text);
      message = parsed.message || message;
    } catch {
      if (text) {
        message = text;
      }
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return (await response.json()) as T;
}

async function getBranchSha(token: string, repoInput: string, branch: string) {
  const { owner, repo } = parseRepo(repoInput);
  const data = await githubRequest<{ object: { sha: string } }>({
    token,
    path: `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`,
  });
  return data.object.sha;
}

async function ensureBranch(token: string, repoInput: string, baseBranch: string, branch: string) {
  const { owner, repo } = parseRepo(repoInput);
  try {
    await getBranchSha(token, repoInput, branch);
    return;
  } catch {
    const baseSha = await getBranchSha(token, repoInput, baseBranch);
    await githubRequest({
      token,
      method: 'POST',
      path: `/repos/${owner}/${repo}/git/refs`,
      body: {
        ref: `refs/heads/${branch}`,
        sha: baseSha,
      },
    });
  }
}

async function getFileSha(token: string, repoInput: string, branch: string, filePath: string) {
  const { owner, repo } = parseRepo(repoInput);
  try {
    const data = await githubRequest<{ sha: string }>({
      token,
      path: `/repos/${owner}/${repo}/contents/${filePath}?ref=${encodeURIComponent(branch)}`,
    });
    return data.sha;
  } catch {
    return undefined;
  }
}

async function upsertFile(
  token: string,
  repoInput: string,
  branch: string,
  filePath: string,
  message: string,
  content: string,
) {
  const { owner, repo } = parseRepo(repoInput);
  const sha = await getFileSha(token, repoInput, branch, filePath);

  await githubRequest({
    token,
    method: 'PUT',
    path: `/repos/${owner}/${repo}/contents/${filePath}`,
    body: {
      message,
      content: Buffer.from(content).toString('base64'),
      branch,
      ...(sha ? { sha } : {}),
    },
  });
}

export async function publishWizardToGitHub(payload: GitHubPublishPayload) {
  const slug =
    payload.config.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'wizard';
  const root = `wizards/${slug}`;
  const prompt = payload.config.steps[0]?.description || '';
  const meta = {
    id: payload.config.id,
    name: payload.config.name,
    description: payload.config.description,
    updatedAt: payload.config.updatedAt,
    branch: payload.branch,
  };

  await ensureBranch(payload.token, payload.repo, payload.baseBranch, payload.branch);

  await upsertFile(
    payload.token,
    payload.repo,
    payload.branch,
    `${root}/config.json`,
    payload.message,
    JSON.stringify(payload.config, null, 2),
  );
  await upsertFile(payload.token, payload.repo, payload.branch, `${root}/prompt.txt`, payload.message, prompt);
  await upsertFile(
    payload.token,
    payload.repo,
    payload.branch,
    `${root}/meta.json`,
    payload.message,
    JSON.stringify(meta, null, 2),
  );

  return {
    branch: payload.branch,
    repo: payload.repo,
    path: root,
  };
}

export async function syncWizardFromGitHub(token: string, repoInput: string, branch: string, wizardName: string) {
  const { owner, repo } = parseRepo(repoInput);
  const slug =
    wizardName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'wizard';
  const filePath = `wizards/${slug}/config.json`;
  const data = await githubRequest<{ content: string }>({
    token,
    path: `/repos/${owner}/${repo}/contents/${filePath}?ref=${encodeURIComponent(branch)}`,
  });
  const decoded = Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf8');
  return JSON.parse(decoded) as WizardConfig;
}

export async function mergeBranchOnGitHub(
  token: string,
  repoInput: string,
  baseBranch: string,
  branch: string,
  commitMessage: string,
) {
  const { owner, repo } = parseRepo(repoInput);
  return githubRequest({
    token,
    method: 'POST',
    path: `/repos/${owner}/${repo}/merges`,
    body: {
      base: baseBranch,
      head: branch,
      commit_message: commitMessage,
    },
  });
}
