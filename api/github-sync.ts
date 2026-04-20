import { syncWizardFromGitHub } from '../lib/github-publish.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const token = String(req.body?.token || '').trim();
    const repo = String(req.body?.repo || '').trim();
    const branch = String(req.body?.branch || '').trim();
    const wizardName = String(req.body?.wizardName || '').trim();

    if (!token || !repo || !branch || !wizardName) {
      return res.status(400).json({ error: 'token, repo, branch, and wizardName are required' });
    }

    const wizard = await syncWizardFromGitHub(token, repo, branch, wizardName);
    res.json({ wizard });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to sync from GitHub' });
  }
}
