import { uploadKnowledgeFiles } from "../lib/wizard-backend";

export default function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const wizardId = String(req.body?.wizardId || "");
    const files = Array.isArray(req.body?.files) ? req.body.files : [];

    if (!wizardId) {
      res.status(400).json({ error: "Wizard id is required" });
      return;
    }

    if (!files.length) {
      res.status(400).json({ error: "At least one file is required" });
      return;
    }

    const result = uploadKnowledgeFiles(wizardId, files);
    res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to upload knowledge files";
    const status = message === "Wizard not found" ? 404 : 500;
    res.status(status).json({ error: message });
  }
}
