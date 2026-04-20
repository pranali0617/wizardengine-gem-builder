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
const AI_PROVIDER = (process.env.AI_PROVIDER || "groq").toLowerCase();
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

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
    throw new Error("Add some prompt text first.");
  }

  const promptTemplate = `
Return valid JSON only. No markdown fences. No extra text before or after.

Return exactly this JSON shape:
{
  "roleLine": "Act as ...",
  "purposeGoals": ["bullet 1", "bullet 2", "bullet 3"],
  "behaviorRules": {
    "initialInquiry": ["bullet a", "bullet b", "bullet c"],
    "stepByStepGuidance": ["bullet a", "bullet b", "bullet c"],
    "supportiveFeedback": ["bullet a", "bullet b"]
  },
  "toneBullets": ["bullet 1", "bullet 2", "bullet 3"],
  "summary": "one sentence summary",
  "suggestions": ["tip 1", "tip 2", "tip 3"]
}

Rules:
- roleLine: A single sentence starting with "Act as" that establishes a rich expert identity including specialty, methodology, and approach.
- purposeGoals: Exactly 3 strings. Each names a specific technique, framework, or measurable outcome. Never write vague bullets like "help the user."
- behaviorRules.initialInquiry: Exactly 3 strings describing how the Gem opens the conversation — how it introduces itself, what opening question it asks, and how it responds to the user's first message.
- behaviorRules.stepByStepGuidance: Exactly 3 strings. Each describes a specific teaching or coaching behavior referencing a real concept, technique, or framework.
- behaviorRules.supportiveFeedback: Exactly 2 strings describing how the Gem tracks progress and maintains encouragement.
- toneBullets: Exactly 3 strings. Each is a vivid, specific communication style description using example phrases. Never use generic words like "friendly" alone.
- Keep the user's core intent exactly but elevate the quality significantly.
- Infer domain-relevant detail from the topic.
- Where appropriate, include a reminder that the Gem is an AI and not a substitute for licensed professional care.

Reference quality example — for input "Act as expert to improve the user self confidence", the output should be:
{
  "roleLine": "Act as an expert Confidence Coach and Psychologist specialized in self-esteem building and behavioral change, drawing on Cognitive Behavioral Therapy (CBT) and Positive Psychology.",
  "purposeGoals": [
    "Empower users to identify their inner strengths and overcome self-doubt through evidence-based techniques such as CBT reframing and Positive Psychology affirmations.",
    "Provide actionable micro-challenges, perspective shifts, and structured exercises tailored to the user's specific confidence barrier — whether public speaking, social anxiety, or career growth.",
    "Guide users toward lasting self-assurance by building momentum through small wins, tracking progress, and reinforcing a Growth Mindset across sessions."
  ],
  "behaviorRules": {
    "initialInquiry": [
      "Greet the user warmly and introduce yourself as their dedicated Self-Confidence Expert, setting a safe and encouraging tone from the first message.",
      "Ask the user to describe one specific situation where their confidence feels lowest, such as speaking in public, social settings, or professional environments.",
      "Validate their feelings actively before offering any advice — acknowledge what they shared, normalize the struggle, and only then transition into guidance."
    ],
    "stepByStepGuidance": [
      "Introduce targeted concepts such as Reframing Negative Self-Talk, the Growth Mindset, or Power Posing when directly relevant to what the user shares — always explain the concept briefly before applying it.",
      "Offer one small, concrete Micro-Challenge per session for the user to try in their daily life, framed as an achievable experiment rather than a demand.",
      "Keep responses focused to 3–4 sentences per turn to maintain a conversational pace, and ask one focused follow-up question at the end of each response to keep momentum."
    ],
    "supportiveFeedback": [
      "Check in on previous Micro-Challenges or exercises at the start of follow-up conversations, celebrating wins and reframing setbacks as learning data.",
      "Remind the user that you are an AI persona and that while you provide expert-level guidance, this does not replace professional medical or mental health therapy for clinical conditions."
    ]
  },
  "toneBullets": [
    "Empowering and empathetic — use affirmative language such as 'You have the capacity to' or 'Let's explore your strengths together' to reinforce agency.",
    "Motivational yet grounded — celebrate small wins genuinely without minimizing real struggles, and never toxic-positivity the user's pain.",
    "Patient, non-judgmental, and warm — use emojis occasionally to soften the tone, but keep the overall register professional and credible."
  ],
  "summary": "A premium confidence coaching Gem that combines CBT, Positive Psychology, and structured micro-challenges to help users build lasting self-assurance.",
  "suggestions": [
    "Mention the specific area where your confidence is lowest for a more targeted coaching plan.",
    "Try the first Micro-Challenge for 3 days and then return to report back — progress tracking makes the coaching more effective.",
    "If you want deeper support, consider pairing this Gem with a licensed therapist or counselor for clinical concerns."
  ]
}

Now produce the same quality output for this user input:
${trimmed}
`.trim();

  const parseStructuredRefinement = (text: string, provider: "gemini" | "groq") => {
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

    if (!parsed.roleLine) {
      throw new Error(`${provider} returned an invalid refinement payload.`);
    }

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
      summary: parsed.summary?.trim() || `Refined with ${provider === "groq" ? "Groq" : "Gemini"}.`,
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 4) : [],
      provider,
    };
  };

  if (AI_PROVIDER === "gemini") {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      throw new Error("Gemini refinement is unavailable because GEMINI_API_KEY is not set.");
    }

    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{ role: "user", parts: [{ text: promptTemplate }] }],
        config: { responseMimeType: "application/json" },
      });

      const text = response.text?.trim();
      if (!text) {
        throw new Error("Gemini returned an empty refinement response.");
      }

      return parseStructuredRefinement(text, "gemini");
    } catch (error) {
      console.error("Gemini refinement failed:", error);
      throw new Error("Gemini refinement failed. Check GEMINI_API_KEY, GEMINI_MODEL, and your API quota.");
    }
  }

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    throw new Error("Groq refinement is unavailable because GROQ_API_KEY is not set.");
  }

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${groqKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "You produce premium structured custom-Gem instructions as strict JSON.",
          },
          {
            role: "user",
            content: promptTemplate,
          },
        ],
      }),
    });

    const data = (await response.json()) as {
      error?: { message?: string };
      choices?: Array<{ message?: { content?: string } }>;
    };

    if (!response.ok) {
      throw new Error(data.error?.message || "Groq request failed.");
    }

    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) {
      throw new Error("Groq returned an empty refinement response.");
    }

    return parseStructuredRefinement(text, "groq");
  } catch (error) {
    console.error("Groq refinement failed:", error);
    throw new Error("Groq refinement failed. Check GROQ_API_KEY, GROQ_MODEL, and your API quota.");
  }
}
