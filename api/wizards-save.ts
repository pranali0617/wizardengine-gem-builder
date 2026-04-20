import { normalizeWizard, ensureStore, writeStore } from '../lib/wizard-backend.js';

export default function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const config = req.body?.config;
  if (!config) return res.status(400).json({ error: 'Missing config' });
  
  try {
    const normalized = normalizeWizard(config);
    const store = ensureStore();
    const existingIndex = store.wizards.findIndex(w => w.id === normalized.id);
    
    if (existingIndex >= 0) {
      store.wizards[existingIndex] = normalized;
    } else {
      store.wizards.push(normalized);
    }
    
    writeStore(store);
    res.json({ saved: true, wizard: normalized });
  } catch (error: any) {
    console.error('Save wizard failed:', error);
    res.status(500).json({ error: error?.message || 'Failed to save wizard' });
  }
}