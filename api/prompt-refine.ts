import { refinePrompt } from "../lib/wizard-backend";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const prompt = String(req.body?.prompt || "");
    const currentPrompt = String(req.body?.currentPrompt || "");
    const result = await refinePrompt(prompt, currentPrompt);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Prompt refinement failed",
    });
  }
}
