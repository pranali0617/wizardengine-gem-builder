import { ensureStore, normalizeWizard, writeStore } from "../lib/wizard-backend";

export default function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const incoming = normalizeWizard(req.body?.config || {});
    const store = ensureStore();
    const existingIndex = store.wizards.findIndex((wizard) => wizard.id === incoming.id);

    if (existingIndex >= 0) {
      store.wizards[existingIndex] = {
        ...store.wizards[existingIndex],
        ...incoming,
        updatedAt: new Date().toISOString(),
      };
    } else {
      store.wizards.unshift(incoming);
    }

    store.currentWizardId = incoming.id;
    writeStore(store);

    res.status(200).json({ saved: true, wizard: incoming });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unable to save wizard",
    });
  }
}
