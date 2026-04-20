export default function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { wizardId, files } = req.body || {};
  if (!wizardId) return res.status(400).json({ error: 'Wizard id is required' });
  if (!Array.isArray(files) || !files.length) return res.status(400).json({ error: 'No files provided' });
  const uploaded = files.map((f: any) => f.name);
  res.status(200).json({ uploaded, wizard: { id: wizardId, knowledgeFiles: uploaded } });
}