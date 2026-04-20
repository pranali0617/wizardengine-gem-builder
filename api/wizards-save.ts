
export default function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const config = req.body?.config;
  if (!config) return res.status(400).json({ error: 'Missing config' });
  res.status(200).json({ saved: true, wizard: { ...config, updatedAt: new Date().toISOString() } });
}
