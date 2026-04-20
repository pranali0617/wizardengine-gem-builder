import { refinePrompt } from '../lib/wizard-backend';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const prompt = String(req.body?.prompt || '').trim();
  if (!prompt) return res.status(400).json({ error: 'Missing prompt' });
  
  try {
    const result = await refinePrompt(prompt, req.body?.currentPrompt || '');
    res.json(result);
  } catch (error: any) {
    console.error('Refinement failed:', error);
    res.status(500).json({ 
      error: error?.message || 'Failed to refine prompt',
      provider: 'error'
    });
  }
}
