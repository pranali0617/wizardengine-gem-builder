import fs from "fs";
import path from "path";
import { GoogleGenAI } from "@google/genai";

type StepType = "text" | "choice" | "input" | "ai-prompt";

export interface WizardStep {
  id: string;
  title: string;
  description: string;
  type: StepType;
  content: string;
  placeholder?: string;
  options?: string[];
  required?: boolean;
}

export interface BrandingConfig {
  primaryColor: string;
  secondaryColor: string;
  logoUrl?: string;
  borderRadius: string;
  fontFamily: string;
}

export interface WizardConfig {
  id: string;
  projectKey: string;
  name: string;
  description: string;
  steps: WizardStep[];
  branding: BrandingConfig;
  version: string;
  defaultTool?: string;
  knowledgeFiles: string[];
  disableKnowledgeCitations: boolean;
  createdAt: string;
  updatedAt: string;
}

interface WizardStore {
  currentWizardId: string;
  wizards: WizardConfig[];
}

const DATA_ROOT =
  process.env.VERCEL === "1"
    ? path.join("/tmp", "wizardengine-ai")
    : path.join(process.cwd(), "data");

const STORE_PATH = path.join(DATA_ROOT, "wizards.json");
const KNOWLEDGE_DIR = path.join(DATA_ROOT, "knowledge");
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

export function defaultWizard(): WizardConfig {
  const now = new Date().toISOString();

  return {
    id: "wizard-starter",
    projectKey: "default-project",
    name: "",
    description: "",
    version: "1.0.0",
    defaultTool: "No default tool",
    knowledgeFiles: [],
    disableKnowledgeCitations: false,
    createdAt: now,
    updatedAt: now,
    branding: {
      primaryColor: "#2563eb",
      secondaryColor: "#f8fafc",
      borderRadius: "16px",
      fontFamily: "Inter, sans-serif",
    },
    steps: [
      {
        id: "step-1",
        title: "Instructions",
        description: "",
        type: "ai-prompt",
        content: "",
        placeholder: "",
      },
    ],
  };
}

function ensureDirs() {
  fs.mkdirSync(DATA_ROOT, { recursive: true });
  fs.mkdirSync(KNOWLEDGE_DIR, { recursive: true });
}

export function ensureStore(): WizardStore {
  ensureDirs();

  if (!fs.existsSync(STORE_PATH)) {
    const starter = defaultWizard();
    const initialStore: WizardStore = {
      currentWizardId: starter.id,
      wizards: [starter],
    };
    fs.writeFileSync(STORE_PATH, JSON.stringify(initialStore, null, 2));
    return initialStore;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, "utf8")) as WizardStore;
    if (!parsed.wizards?.length) {
      throw new Error("Wizard store is empty");
    }
    return parsed;
  } catch {
    const starter = defaultWizard();
    const resetStore: WizardStore = {
      currentWizardId: starter.id,
      wizards: [starter],
    };
    fs.writeFileSync(STORE_PATH, JSON.stringify(resetStore, null, 2));
    return resetStore;
  }
}

export function writeStore(store: WizardStore) {
  ensureDirs();
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

export function normalizeWizard(input: Partial<WizardConfig>): WizardConfig {
  const fallback = defaultWizard();
  const now = new Date().toISOString();

  return {
    ...fallback,
    ...input,
    id: input.id || fallback.id,
    projectKey: input.projectKey || fallback.projectKey,
    name: input.name?.trim() || fallback.name,
    description: input.description?.trim() || fallback.description,
    version: input.version?.trim() || fallback.version,
    defaultTool: input.defaultTool?.trim() || fallback.defaultTool,
    knowledgeFiles: Array.isArray(input.knowledgeFiles) ? input.knowledgeFiles : [],
    disableKnowledgeCitations: Boolean(input.disableKnowledgeCitations),
    createdAt: input.createdAt || now,
    updatedAt: now,
    branding: {
      ...fallback.branding,
      ...input.branding,
    },
    steps: (input.steps || fallback.steps).map((step, index) => ({
      id: step.id || `step-${index + 1}`,
      title: step.title?.trim() || `Step ${index + 1}`,
      description: step.description?.trim() || "",
      type: (step.type || "input") as StepType,
      content: step.content || "",
      placeholder: step.placeholder,
      options: Array.isArray(step.options) ? step.options.filter(Boolean) : undefined,
      required: Boolean(step.required),
    })),
  };
}

function safeFilename(name: string) {
  const base = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "-");
  return base || `file-${Date.now()}`;
}

function writeKnowledgeFile(filename: string, base64Content: string) {
  ensureDirs();
  const safeName = `${Date.now()}-${safeFilename(filename)}`;
  const filePath = path.join(KNOWLEDGE_DIR, safeName);
  fs.writeFileSync(filePath, Buffer.from(base64Content, "base64"));
  return safeName;
}

export function uploadKnowledgeFiles(
  wizardId: string,
  files: Array<{ name?: string; content?: string }>,
) {
  const store = ensureStore();
  const wizardIndex = store.wizards.findIndex((wizard) => wizard.id === wizardId);
  if (wizardIndex < 0) {
    throw new Error("Wizard not found");
  }

  const uploadedNames = files.map((file) => {
    if (!file?.name || !file?.content) {
      throw new Error("Invalid file payload");
    }
    return writeKnowledgeFile(file.name, file.content);
  });

  const wizard = store.wizards[wizardIndex];
  const updatedWizard = {
    ...wizard,
    knowledgeFiles: Array.from(new Set([...(wizard.knowledgeFiles || []), ...uploadedNames])),
    updatedAt: new Date().toISOString(),
  };

  store.wizards[wizardIndex] = updatedWizard;
  store.currentWizardId = updatedWizard.id;
  writeStore(store);

  return {
    uploaded: uploadedNames,
    wizard: updatedWizard,
  };
}

export async function refinePrompt(prompt: string, currentPrompt = "") {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return {
      refinedPrompt: "",
      summary: "Add some prompt text first.",
      suggestions: [],
      provider: "fallback" as const,
    };
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `
Return valid JSON only with keys:
- roleLine
- purposeGoals
- behaviorRules
- toneBullets
- summary
- suggestions

The user wants a Gemini-style Gem instruction, but with a stable fixed format.

Write content for this exact structure:

Act as ...

Purpose and Goals:
* ...
* ...
* ...

Behaviors and Rules:
1) Initial Inquiry:
a) ...
b) ...
c) ...

2) Step-by-Step Guidance:
a) ...
b) ...
c) ...

3) Supportive Feedback:
a) ...
b) ...

Overall Tone:
* ...
* ...
* ...

Rules:
- Keep the user's intent exactly, but improve it.
- Keep each bullet practical and specific.
- If the user asks for teaching, learning, coaching, planning, mentoring, or step-by-step help, make the structure reflect that.
- Do not return markdown fences.
- Do not change the top-level section names.
- Do not add extra sections.

Current prompt:
${currentPrompt || "(empty)"}

User's raw instructions:
${trimmed}
                `.trim(),
              },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
        },
      });

      const text = response.text?.trim();
      if (text) {
        const parsed = JSON.parse(text) as {
          roleLine?: string;
          purposeGoals?: string[];
          behaviorRules?: {
            initialInquiry?: string[];
            stepByStepGuidance?: string[];
            supportiveFeedback?: string[];
          };
          toneBullets?: string[];
          summary?: string;
          suggestions?: string[];
        };

        if (parsed.roleLine) {
          const purposeGoals = Array.isArray(parsed.purposeGoals) ? parsed.purposeGoals : [];
          const initialInquiry = Array.isArray(parsed.behaviorRules?.initialInquiry)
            ? parsed.behaviorRules.initialInquiry
            : [];
          const stepByStepGuidance = Array.isArray(parsed.behaviorRules?.stepByStepGuidance)
            ? parsed.behaviorRules.stepByStepGuidance
            : [];
          const supportiveFeedback = Array.isArray(parsed.behaviorRules?.supportiveFeedback)
            ? parsed.behaviorRules.supportiveFeedback
            : [];
          const toneBullets = Array.isArray(parsed.toneBullets) ? parsed.toneBullets : [];

          const refinedPrompt = [
            parsed.roleLine.trim(),
            "",
            "Purpose and Goals:",
            ...purposeGoals.map((item) => `* ${item}`),
            "",
            "Behaviors and Rules:",
            "1) Initial Inquiry:",
            ...initialInquiry.map((item, index) => `${String.fromCharCode(97 + index)}) ${item}`),
            "",
            "2) Step-by-Step Guidance:",
            ...stepByStepGuidance.map((item, index) => `${String.fromCharCode(97 + index)}) ${item}`),
            "",
            "3) Supportive Feedback:",
            ...supportiveFeedback.map((item, index) => `${String.fromCharCode(97 + index)}) ${item}`),
            "",
            "Overall Tone:",
            ...toneBullets.map((item) => `* ${item}`),
          ]
            .filter((line, index, lines) => !(line === "" && lines[index - 1] === ""))
            .join("\n");

          return {
            refinedPrompt,
            summary: parsed.summary?.trim() || "Refined with Gemini.",
            suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 4) : [],
            provider: "gemini" as const,
          };
        }
      }
    } catch (error) {
      console.error("Gemini refinement failed:", error);
    }
  }

  const refinedPrompt = [
    "Act as a specialized assistant aligned to the user's intent.",
    "",
    "Purpose and Goals:",
    `* ${trimmed.charAt(0).toUpperCase() + trimmed.slice(1)}`,
    "* Provide clear, practical, and useful support.",
    "* Keep the conversation structured and easy to follow.",
    "",
    "Behaviors and Rules:",
    "1) Initial Inquiry:",
    "a) Start by understanding the user's specific situation or goal.",
    "b) Ask a focused question if critical context is missing.",
    "c) Keep the conversation easy to follow from the start.",
    "",
    "2) Step-by-Step Guidance:",
    "a) Break the response into clear, manageable guidance.",
    "b) Explain what to do and why it matters.",
    "c) Keep the structure practical and actionable.",
    "",
    "3) Supportive Feedback:",
    "a) Be encouraging without sounding vague.",
    "b) Help the user keep momentum.",
    "",
    "Overall Tone:",
    "* Helpful, structured, and confident.",
    "* Clear and easy to apply.",
    "* Supportive and practical.",
  ].join("\n");

  return {
    refinedPrompt,
    summary: "Used the built-in fallback refiner because a Gemini API key was not available.",
    suggestions: [
      "Mention the exact role you want the Gem to play.",
      "Say whether answers should be step-by-step, brief, or deeply structured.",
      "Include tone, rules, and follow-up behavior you want enforced.",
    ],
    provider: "fallback" as const,
  };
}
