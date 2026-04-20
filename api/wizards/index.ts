import { ensureStore } from "../../lib/wizard-backend";

export default function handler(_req: any, res: any) {
  try {
    const store = ensureStore();
    const current =
      store.wizards.find((wizard) => wizard.id === store.currentWizardId) || store.wizards[0];

    res.status(200).json({
      currentWizard: current,
      templates: store.wizards.map((wizard) => ({
        id: wizard.id,
        name: wizard.name,
        projectKey: wizard.projectKey,
        description: wizard.description,
        version: wizard.version,
        updatedAt: wizard.updatedAt,
        stepsCount: wizard.steps.length,
      })),
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unable to load wizards",
    });
  }
}
