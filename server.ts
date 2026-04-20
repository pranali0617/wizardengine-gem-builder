import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { execFileSync } from "child_process";
import dotenv from "dotenv";
import { refinePrompt as sharedRefinePrompt } from "./lib/wizard-backend";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);
const PROJECT_ROOT = process.cwd();
const DATA_DIR = path.join(PROJECT_ROOT, "data");
const STORE_PATH = path.join(DATA_DIR, "wizards.json");
const KNOWLEDGE_DIR = path.join(DATA_DIR, "knowledge");

type StepType = "text" | "choice" | "input" | "ai-prompt";

interface WizardStep {
  id: string;
  title: string;
  description: string;
  type: StepType;
  content: string;
  placeholder?: string;
  options?: string[];
  required?: boolean;
}

interface BrandingConfig {
  primaryColor: string;
  secondaryColor: string;
  logoUrl?: string;
  borderRadius: string;
  fontFamily: string;
}

interface WizardConfig {
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

const defaultWizard = (): WizardConfig => {
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
        description: "Draft the instructions that power your workflow. Use AI refinement to polish them.",
        type: "ai-prompt",
        content: "",
        placeholder: "",
      },
    ],
  };
};

function ensureStore(): WizardStore {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(KNOWLEDGE_DIR)) {
    fs.mkdirSync(KNOWLEDGE_DIR, { recursive: true });
  }

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

function writeStore(store: WizardStore) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

function safeFilename(name: string) {
  const base = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "-");
  return base || `file-${Date.now()}`;
}

function writeKnowledgeFile(filename: string, base64Content: string) {
  const safeName = `${Date.now()}-${safeFilename(filename)}`;
  const filePath = path.join(KNOWLEDGE_DIR, safeName);
  fs.writeFileSync(filePath, Buffer.from(base64Content, "base64"));
  return safeName;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || `wizard-${Date.now()}`;
}

function normalizeWizard(input: Partial<WizardConfig>): WizardConfig {
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

function buildReactExport(config: WizardConfig) {
  const serialized = JSON.stringify(config, null, 2);

  return `import React from "react";
import WizardPreview from "./WizardPreview";

const wizardConfig = ${serialized};

export default function ExportedWizard() {
  return <WizardPreview config={wizardConfig} />;
}
`;
}

function runGit(args: string[]) {
  return execFileSync("git", args, {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function isGitRepo() {
  try {
    return runGit(["rev-parse", "--is-inside-work-tree"]) === "true";
  } catch {
    return false;
  }
}

function getGitStatus() {
  if (!isGitRepo()) {
    return {
      available: false,
      branch: "not-initialized",
      latestCommit: "none",
      commitMessage: "Initialize git to enable repository actions.",
      status: "unavailable",
      changedFiles: [],
      branches: [],
      aheadCount: 0,
      behindCount: 0,
      hasRemote: false,
      error: "This workspace is not a git repository yet.",
    };
  }

  try {
    const branch = runGit(["branch", "--show-current"]) || "detached-head";
    const latestCommit = (() => {
      try {
        return runGit(["rev-parse", "--short", "HEAD"]);
      } catch {
        return "none";
      }
    })();
    const commitMessage = (() => {
      try {
        return runGit(["log", "-1", "--pretty=%s"]);
      } catch {
        return "No commits yet. Save draft changes and publish your first version.";
      }
    })();
    const changedFiles = runGit(["status", "--porcelain"])
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const branches = runGit(["branch", "--format=%(refname:short)"])
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const repoRoot = runGit(["rev-parse", "--show-toplevel"]);
    const hasRemote = (() => {
      try {
        return Boolean(runGit(["remote"]));
      } catch {
        return false;
      }
    })();
    const upstreamExists = (() => {
      try {
        runGit(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
        return true;
      } catch {
        return false;
      }
    })();
    const [behindCount, aheadCount] =
      hasRemote && upstreamExists
        ? runGit(["rev-list", "--left-right", "--count", "HEAD...@{u}"])
            .split(/\s+/)
            .map((value) => Number(value) || 0)
        : [0, 0];

    return {
      available: true,
      repoRoot,
      branch,
      latestCommit,
      commitMessage,
      status: changedFiles.length ? "dirty" : "clean",
      changedFiles,
      branches,
      aheadCount,
      behindCount,
      hasRemote,
    };
  } catch (error) {
    return {
      available: false,
      branch: "error",
      latestCommit: "unknown",
      commitMessage: "Unable to inspect repository state.",
      status: "unavailable",
      changedFiles: [],
      branches: [],
      aheadCount: 0,
      behindCount: 0,
      hasRemote: false,
      error: error instanceof Error ? error.message : "Unknown git error",
    };
  }
}

function stageWorkspaceFiles() {
  const candidates = ["data", "package.json", "package-lock.json"];
  const existing = candidates.filter((candidate) => fs.existsSync(path.join(PROJECT_ROOT, candidate)));

  if (!existing.length) {
    throw new Error("No tracked wizard files found to stage.");
  }

  runGit(["add", ...existing]);
}

function getDependencies() {
  const packageJsonPath = path.join(PROJECT_ROOT, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  const scopes: Array<"dependencies" | "devDependencies"> = ["dependencies", "devDependencies"];

  return scopes.flatMap((scope) =>
    Object.entries(packageJson[scope] || {}).map(([name, requestedVersion]) => {
      const installedPackagePath = path.join(PROJECT_ROOT, "node_modules", name, "package.json");
      const installedVersion = fs.existsSync(installedPackagePath)
        ? JSON.parse(fs.readFileSync(installedPackagePath, "utf8")).version
        : null;

      return {
        name,
        scope,
        requestedVersion,
        installedVersion,
        status: installedVersion ? "installed" : "missing",
      };
    }),
  );
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/wizards", (_req, res) => {
    const store = ensureStore();
    const current = store.wizards.find((wizard) => wizard.id === store.currentWizardId) || store.wizards[0];

    res.json({
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
  });

  app.post("/api/wizards/save", (req, res) => {
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
    res.json({ saved: true, wizard: incoming });
  });

  app.post("/api/wizards-save", (req, res) => {
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
    res.json({ saved: true, wizard: incoming });
  });

  app.post("/api/wizards/duplicate", (req, res) => {
    const store = ensureStore();
    const sourceId = String(req.body?.id || store.currentWizardId);
    const source = store.wizards.find((wizard) => wizard.id === sourceId) || store.wizards[0];
    const now = new Date().toISOString();
    const duplicate = {
      ...source,
      id: `${slugify(source.name)}-${Date.now()}`,
      name: `${source.name} Copy`,
      createdAt: now,
      updatedAt: now,
    };

    store.wizards.unshift(duplicate);
    store.currentWizardId = duplicate.id;
    writeStore(store);
    res.json({ wizard: duplicate });
  });

  app.post("/api/wizards/select", (req, res) => {
    const store = ensureStore();
    const id = String(req.body?.id || "");
    const wizard = store.wizards.find((item) => item.id === id);

    if (!wizard) {
      res.status(404).json({ error: "Wizard not found" });
      return;
    }

    store.currentWizardId = id;
    writeStore(store);
    res.json({ wizard });
  });

  app.post("/api/knowledge/upload", (req, res) => {
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

      const store = ensureStore();
      const wizardIndex = store.wizards.findIndex((wizard) => wizard.id === wizardId);
      if (wizardIndex < 0) {
        res.status(404).json({ error: "Wizard not found" });
        return;
      }

      const uploadedNames = files.map((file: { name?: string; content?: string }) => {
        if (!file?.name || !file?.content) {
          throw new Error("Invalid file payload");
        }
        return writeKnowledgeFile(file.name, file.content);
      });

      const wizard = store.wizards[wizardIndex];
      const mergedKnowledgeFiles = Array.from(new Set([...(wizard.knowledgeFiles || []), ...uploadedNames]));
      const updatedWizard = {
        ...wizard,
        knowledgeFiles: mergedKnowledgeFiles,
        updatedAt: new Date().toISOString(),
      };

      store.wizards[wizardIndex] = updatedWizard;
      if (store.currentWizardId === updatedWizard.id) {
        store.currentWizardId = updatedWizard.id;
      }
      writeStore(store);

      res.json({
        uploaded: uploadedNames,
        wizard: updatedWizard,
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Unable to upload knowledge files",
      });
    }
  });

  app.post("/api/knowledge-upload", (req, res) => {
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

      const store = ensureStore();
      const wizardIndex = store.wizards.findIndex((wizard) => wizard.id === wizardId);
      if (wizardIndex < 0) {
        res.status(404).json({ error: "Wizard not found" });
        return;
      }

      const uploadedNames = files.map((file: { name?: string; content?: string }) => {
        if (!file?.name || !file?.content) {
          throw new Error("Invalid file payload");
        }
        return writeKnowledgeFile(file.name, file.content);
      });

      const wizard = store.wizards[wizardIndex];
      const mergedKnowledgeFiles = Array.from(new Set([...(wizard.knowledgeFiles || []), ...uploadedNames]));
      const updatedWizard = {
        ...wizard,
        knowledgeFiles: mergedKnowledgeFiles,
        updatedAt: new Date().toISOString(),
      };

      store.wizards[wizardIndex] = updatedWizard;
      if (store.currentWizardId === updatedWizard.id) {
        store.currentWizardId = updatedWizard.id;
      }
      writeStore(store);

      res.json({
        uploaded: uploadedNames,
        wizard: updatedWizard,
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Unable to upload knowledge files",
      });
    }
  });

  app.post("/api/prompt/refine", async (req, res) => {
    try {
      const prompt = String(req.body?.prompt || "");
      const currentPrompt = String(req.body?.currentPrompt || "");
      const result = await sharedRefinePrompt(prompt, currentPrompt);
      res.json(result);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Prompt refinement failed",
      });
    }
  });

  app.post("/api/prompt-refine", async (req, res) => {
    try {
      const prompt = String(req.body?.prompt || "");
      const currentPrompt = String(req.body?.currentPrompt || "");
      const result = await sharedRefinePrompt(prompt, currentPrompt);
      res.json(result);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Prompt refinement failed",
      });
    }
  });

  app.get("/api/git/status", (_req, res) => {
    res.json(getGitStatus());
  });

  app.post("/api/git/init", (_req, res) => {
    try {
      if (!isGitRepo()) {
        runGit(["init"]);
      }
      res.json(getGitStatus());
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Unable to initialize git",
      });
    }
  });

  app.post("/api/git/branch", (req, res) => {
    try {
      const name = String(req.body?.name || "").trim();
      if (!name) {
        res.status(400).json({ error: "Branch name is required" });
        return;
      }

      runGit(["checkout", "-b", name]);
      res.json(getGitStatus());
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Unable to create branch",
      });
    }
  });

  app.post("/api/git/checkout", (req, res) => {
    try {
      const name = String(req.body?.name || "").trim();
      if (!name) {
        res.status(400).json({ error: "Branch name is required" });
        return;
      }

      runGit(["checkout", name]);
      res.json(getGitStatus());
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Unable to checkout branch",
      });
    }
  });

  app.post("/api/git/pull", (_req, res) => {
    try {
      runGit(["pull", "--ff-only"]);
      res.json(getGitStatus());
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Unable to pull from remote",
      });
    }
  });

  app.post("/api/git/commit", (req, res) => {
    try {
      const message = String(req.body?.message || "").trim() || "Update wizard";
      stageWorkspaceFiles();
      const changedAfterStage = runGit(["status", "--porcelain"])
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      if (!changedAfterStage.length) {
        res.json({
          committed: false,
          status: getGitStatus(),
          message: "No changes to commit.",
        });
        return;
      }

      runGit(["commit", "-m", message]);
      res.json({
        committed: true,
        status: getGitStatus(),
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Unable to commit changes",
      });
    }
  });

  app.post("/api/git/push", (_req, res) => {
    try {
      const branch = runGit(["branch", "--show-current"]) || "main";
      const hasRemote = (() => {
        try {
          return Boolean(runGit(["remote"]));
        } catch {
          return false;
        }
      })();

      if (!hasRemote) {
        res.status(400).json({ error: "No remote is configured for this repository." });
        return;
      }

      const upstreamExists = (() => {
        try {
          runGit(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
          return true;
        } catch {
          return false;
        }
      })();

      if (upstreamExists) {
        runGit(["push"]);
      } else {
        runGit(["push", "-u", "origin", branch]);
      }

      res.json(getGitStatus());
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Unable to push changes",
      });
    }
  });

  app.post("/api/git/merge", (req, res) => {
    try {
      const from = String(req.body?.from || "").trim();
      if (!from) {
        res.status(400).json({ error: "Source branch is required" });
        return;
      }

      runGit(["merge", "--no-edit", from]);
      res.json(getGitStatus());
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Unable to merge branch",
      });
    }
  });

  app.get("/api/dependencies", (_req, res) => {
    res.json(getDependencies());
  });

  app.post("/api/dependencies/update", (req, res) => {
    try {
      const name = String(req.body?.name || "").trim();
      const scope = req.body?.scope === "devDependencies" ? "devDependencies" : "dependencies";
      const version = String(req.body?.version || "").trim();

      if (!name || !version) {
        res.status(400).json({ error: "Dependency name and version are required" });
        return;
      }

      const packageJsonPath = path.join(PROJECT_ROOT, "package.json");
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as Record<string, any>;
      packageJson[scope] = packageJson[scope] || {};
      packageJson[scope][name] = version;
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + "\n");

      res.json({
        updated: true,
        dependencies: getDependencies(),
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Unable to update dependency",
      });
    }
  });

  app.post("/api/export/react", (req, res) => {
    const config = normalizeWizard(req.body?.config || {});
    res.json({
      filename: `${slugify(config.name)}.tsx`,
      code: buildReactExport(config),
    });
  });

  app.post("/api/export/step", (req, res) => {
    const config = normalizeWizard(req.body?.config || {});
    const stepId = String(req.body?.stepId || "");
    const step = config.steps.find((item) => item.id === stepId);

    if (!step) {
      res.status(404).json({ error: "Step not found" });
      return;
    }

    res.json({
      step,
      json: JSON.stringify(step, null, 2),
      react: `const step = ${JSON.stringify(step, null, 2)};`,
    });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
