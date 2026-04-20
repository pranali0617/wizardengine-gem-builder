export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const prompt = String(req.body?.prompt || '').trim();
  if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(200).json({ refinedPrompt: prompt, provider: 'fallback' });

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: `Rewrite this AI system prompt to be clearer and more specific. Return only the improved text:\n\n${prompt}` }] }] }),
      }
    );
    const data = await r.json() as any;
    const refinedPrompt = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? prompt;
    res.status(200).json({ refinedPrompt, provider: 'gemini' });
  } catch {
    res.status(200).json({ refinedPrompt: prompt, provider: 'fallback' });
  }
}