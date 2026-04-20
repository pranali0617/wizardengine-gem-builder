import { mergeBranchOnGitHub } from '../lib/github-publish.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const token = String(req.body?.token || '').trim();
    const repo = String(req.body?.repo || '').trim();
    const baseBranch = String(req.body?.baseBranch || 'main').trim();
    const branch = String(req.body?.branch || '').trim();
    const message = String(req.body?.message || 'Merge wizard updates').trim();

    if (!token || !repo || !branch) {
      return res.status(400).json({ error: 'token, repo, and branch are required' });
    }

    const result = await mergeBranchOnGitHub(token, repo, baseBranch, branch, message);
    res.json({ merged: true, result });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to merge on GitHub' });
  }
}
