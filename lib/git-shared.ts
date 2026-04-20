export const unsupportedGitStatus = {
  available: false,
  branch: 'github-integration-required',
  latestCommit: 'none',
  commitMessage: 'Git actions from a shared Vercel link need a GitHub-backed integration.',
  status: 'unavailable' as const,
  changedFiles: [],
  branches: [],
  aheadCount: 0,
  behindCount: 0,
  hasRemote: false,
  error:
    'Git CLI actions are not available inside shared Vercel serverless functions. Use a GitHub integration for browser users.',
};

export function respondWithUnsupportedGit(res: any, method = 'GET') {
  if (method === 'GET') {
    res.json(unsupportedGitStatus);
    return;
  }

  res.status(501).json({
    ...unsupportedGitStatus,
    error:
      'This Git action is not available from the shared Vercel deployment yet. It needs a GitHub-backed integration instead of local git commands.',
  });
}
