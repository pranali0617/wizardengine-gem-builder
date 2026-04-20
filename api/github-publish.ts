import { publishWizardToGitHub } from '../lib/github-publish.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const token = String(req.body?.token || '').trim();
    const repo = String(req.body?.repo || '').trim();
    const baseBranch = String(req.body?.baseBranch || 'main').trim();
    const branch = String(req.body?.branch || '').trim();
    const message = String(req.body?.message || 'Update wizard').trim();
    const config = req.body?.config;

    if (!token || !repo || !branch || !config) {
      return res.status(400).json({ error: 'token, repo, branch, and config are required' });
    }

    const result = await publishWizardToGitHub({
      token,
      repo,
      baseBranch,
      branch,
      message,
      config,
    });

    res.json({ published: true, ...result });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to publish to GitHub' });
  }
}
