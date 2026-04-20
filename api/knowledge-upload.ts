import { uploadKnowledgeFiles } from '@/lib/wizard-backend';

export default function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { wizardId, files } = req.body || {};
  if (!wizardId) return res.status(400).json({ error: 'Wizard id required' });
  
  try {
    const wizard = uploadKnowledgeFiles(wizardId, files || []);
    res.json({ uploaded: (files || []).map((f: any) => f.name), wizard });
  } catch (error: any) {
    console.error('Knowledge upload failed:', error);
    res.status(500).json({ error: error?.message || 'Failed to upload knowledge' });
  }
}