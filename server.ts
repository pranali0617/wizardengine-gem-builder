import express from "express";
import { createServer as createViteServer } from "vite";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { execFileSync } from "child_process";
import dotenv from "dotenv";
import { refinePrompt as sharedRefinePrompt } from "./lib/wizard-backend";
import {
  buildGitHubAuthorizeUrl,
  buildStateCookie,
  clearStateCookie,
  createGitHubState,
  exchangeGitHubCodeForToken,
  fetchGitHubViewer,
  inferAppOrigin,
  readCookie,
} from "./lib/github-auth";
import {
  publishWizardToGitHub,
  syncWizardFromGitHub,
  mergeBranchOnGitHub,
} from "./lib/github-publish";

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

interface WizardSetupSelections {
  gemName: string;
  guideTone: string;
  auditRigor: string;
  learningStyle: string;
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
  setupSelections?: WizardSetupSelections;
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
    setupSelections: {
      gemName: "Life Audit",
      guideTone: "",
      auditRigor: "",
      learningStyle: "",
    },
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
    setupSelections: {
      ...fallback.setupSelections,
      ...input.setupSelections,
      gemName: input.setupSelections?.gemName?.trim() || input.name?.trim() || fallback.setupSelections?.gemName || fallback.name,
      guideTone: input.setupSelections?.guideTone?.trim() || fallback.setupSelections?.guideTone || "",
      auditRigor: input.setupSelections?.auditRigor?.trim() || fallback.setupSelections?.auditRigor || "",
      learningStyle: input.setupSelections?.learningStyle?.trim() || fallback.setupSelections?.learningStyle || "",
    },
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

type GitExecutionOptions = {
  env?: NodeJS.ProcessEnv;
};

type GitAuthInput = {
  username?: string;
  password?: string;
};

function runGit(args: string[], options?: GitExecutionOptions) {
  return execFileSync("git", args, {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      ...options?.env,
    },
  }).trim();
}

function readGitAuth(input: any): GitAuthInput {
  return {
    username: String(input?.username || "").trim(),
    password: String(input?.password || "").trim(),
  };
}

function withGitAuth<T>(auth: GitAuthInput, callback: (env?: NodeJS.ProcessEnv) => T) {
  if (!auth.username && !auth.password) {
    return callback();
  }

  const askPassPath = path.join(
    os.tmpdir(),
    `wizardengine-git-askpass-${process.pid}-${Date.now()}.sh`,
  );

  fs.writeFileSync(
    askPassPath,
    `#!/bin/sh
case "$1" in
  *Username*) printf '%s\\n' "$GIT_USERNAME" ;;
  *Password*) printf '%s\\n' "$GIT_PASSWORD" ;;
  *) printf '%s\\n' "$GIT_PASSWORD" ;;
esac
`,
    { mode: 0o700 },
  );

  try {
    return callback({
      GIT_TERMINAL_PROMPT: "0",
      GIT_ASKPASS: askPassPath,
      GIT_USERNAME: auth.username || "",
      GIT_PASSWORD: auth.password || "",
    });
  } finally {
    fs.unlinkSync(askPassPath);
  }
}

function ensureGitIdentity(username?: string) {
  const trimmed = String(username || "").trim();
  if (!trimmed) {
    return;
  }

  runGit(["config", "user.name", trimmed]);

  try {
    const existingEmail = runGit(["config", "user.email"]);
    if (existingEmail) {
      return;
    }
  } catch {
    // Fall through and set a repo-local default email.
  }

  const fallbackEmail = `${slugify(trimmed)}@wizardengine.local`;
  runGit(["config", "user.email", fallbackEmail]);
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
      trackingBranch: "",
      upstreamConfigured: false,
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
    const trackingBranch = (() => {
      try {
        return runGit(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
      } catch {
        return "";
      }
    })();
    const upstreamExists = Boolean(trackingBranch);
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
      trackingBranch,
      upstreamConfigured: upstreamExists,
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
  runGit(["add", "-A"]);
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

  app.get("/api/github-oauth-start", (req, res) => {
    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) {
      res.status(500).send("Missing GITHUB_CLIENT_ID");
      return;
    }

    const origin = inferAppOrigin(req.headers as Record<string, string | string[] | undefined>);
    const redirectUri = `${origin}/api/github-oauth-callback`;
    const state = createGitHubState();
    const secure = origin.startsWith("https://");

    res.setHeader("Set-Cookie", buildStateCookie(state, secure));
    res.redirect(buildGitHubAuthorizeUrl(clientId, redirectUri, state));
  });

  app.get("/api/github-oauth-callback", async (req, res) => {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      res.status(500).send("Missing GitHub OAuth environment variables.");
      return;
    }

    const origin = inferAppOrigin(req.headers as Record<string, string | string[] | undefined>);
    const secure = origin.startsWith("https://");
    const redirectUri = `${origin}/api/github-oauth-callback`;
    const code = String(req.query?.code || "");
    const state = String(req.query?.state || "");
    const storedState = readCookie(req.headers.cookie, "github_oauth_state");

    res.setHeader("Set-Cookie", clearStateCookie(secure));

    if (!code || !state || !storedState || state !== storedState) {
      res.status(400).send("GitHub OAuth state validation failed.");
      return;
    }

    try {
      const token = await exchangeGitHubCodeForToken({
        clientId,
        clientSecret,
        code,
        redirectUri,
      });
      const viewer = await fetchGitHubViewer(token);

      res.send(`<!doctype html>
<html><body><script>
window.opener && window.opener.postMessage(
  { type: 'github-oauth-success', payload: ${JSON.stringify({ token, login: viewer.login, avatarUrl: viewer.avatar_url })} },
  window.location.origin
);
window.close();
</script></body></html>`);
    } catch (error) {
      res.status(500).send(
        `<!doctype html><html><body><script>
window.opener && window.opener.postMessage(
  { type: 'github-oauth-error', error: ${JSON.stringify(error instanceof Error ? error.message : "GitHub OAuth failed.")} },
  window.location.origin
);
window.close();
</script></body></html>`,
      );
    }
  });

  app.post("/api/github-publish", async (req, res) => {
    try {
      const token = String(req.body?.token || "").trim();
      const repo = String(req.body?.repo || "").trim();
      const baseBranch = String(req.body?.baseBranch || "main").trim();
      const branch = String(req.body?.branch || "").trim();
      const message = String(req.body?.message || "Update wizard").trim();
      const config = normalizeWizard(req.body?.config || {});

      if (!token || !repo || !branch) {
        res.status(400).json({ error: "token, repo, and branch are required" });
        return;
      }

      const result = await publishWizardToGitHub({
        token,
        repo,
        baseBranch,
        branch,
        message,
        config,
      });

      res.json({ published: true, ...result });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to publish to GitHub",
      });
    }
  });

  app.post("/api/github-sync", async (req, res) => {
    try {
      const token = String(req.body?.token || "").trim();
      const repo = String(req.body?.repo || "").trim();
      const branch = String(req.body?.branch || "").trim();
      const wizardName = String(req.body?.wizardName || "").trim();

      if (!token || !repo || !branch || !wizardName) {
        res.status(400).json({ error: "token, repo, branch, and wizardName are required" });
        return;
      }

      const wizard = await syncWizardFromGitHub(token, repo, branch, wizardName);
      res.json({ wizard });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to sync from GitHub",
      });
    }
  });

  app.post("/api/github-merge", async (req, res) => {
    try {
      const token = String(req.body?.token || "").trim();
      const repo = String(req.body?.repo || "").trim();
      const baseBranch = String(req.body?.baseBranch || "main").trim();
      const branch = String(req.body?.branch || "").trim();
      const message = String(req.body?.message || "Merge wizard updates").trim();

      if (!token || !repo || !branch) {
        res.status(400).json({ error: "token, repo, and branch are required" });
        return;
      }

      const result = await mergeBranchOnGitHub(token, repo, baseBranch, branch, message);
      res.json({ merged: true, result });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to merge on GitHub",
      });
    }
  });

  app.get("/api/git/status", (_req, res) => {
    res.json(getGitStatus());
  });

  app.get("/api/git-status", (_req, res) => {
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

  app.post("/api/git-init", (_req, res) => {
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

  app.post("/api/git-branch", (req, res) => {
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

  app.post("/api/git-checkout", (req, res) => {
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
      const status = getGitStatus();
      if (status.hasRemote && !status.upstreamConfigured) {
        res.status(400).json({
          error:
            `This branch is not linked to a remote branch yet. Push ${status.branch} first, or switch to a tracked branch like main before pulling.`,
        });
        return;
      }
      const auth = readGitAuth(_req.body);
      withGitAuth(auth, (env) => runGit(["pull", "--ff-only"], { env }));
      res.json(getGitStatus());
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Unable to pull from remote",
      });
    }
  });

  app.post("/api/git-pull", (_req, res) => {
    try {
      const status = getGitStatus();
      if (status.hasRemote && !status.upstreamConfigured) {
        res.status(400).json({
          error:
            `This branch is not linked to a remote branch yet. Push ${status.branch} first, or switch to a tracked branch like main before pulling.`,
        });
        return;
      }
      const auth = readGitAuth(_req.body);
      withGitAuth(auth, (env) => runGit(["pull", "--ff-only"], { env }));
      res.json(getGitStatus());
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Unable to pull from remote",
      });
    }
  });

  app.post("/api/git/fetch", (req, res) => {
    try {
      const auth = readGitAuth(req.body);
      withGitAuth(auth, (env) => runGit(["fetch", "--all", "--prune"], { env }));
      res.json(getGitStatus());
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Unable to fetch from remote",
      });
    }
  });

  app.post("/api/git-fetch", (req, res) => {
    try {
      const auth = readGitAuth(req.body);
      withGitAuth(auth, (env) => runGit(["fetch", "--all", "--prune"], { env }));
      res.json(getGitStatus());
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Unable to fetch from remote",
      });
    }
  });

  app.post("/api/git/commit", (req, res) => {
    try {
      const message = String(req.body?.message || "").trim() || "Update wizard";
      const auth = readGitAuth(req.body);
      ensureGitIdentity(auth.username);
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

  app.post("/api/git-commit", (req, res) => {
    try {
      const message = String(req.body?.message || "").trim() || "Update wizard";
      const auth = readGitAuth(req.body);
      ensureGitIdentity(auth.username);
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
      const auth = readGitAuth(_req.body);
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
        withGitAuth(auth, (env) => runGit(["push"], { env }));
      } else {
        withGitAuth(auth, (env) => runGit(["push", "-u", "origin", branch], { env }));
      }

      res.json(getGitStatus());
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Unable to push changes",
      });
    }
  });

  app.post("/api/git-push", (_req, res) => {
    try {
      const auth = readGitAuth(_req.body);
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
        withGitAuth(auth, (env) => runGit(["push"], { env }));
      } else {
        withGitAuth(auth, (env) => runGit(["push", "-u", "origin", branch], { env }));
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
      const to = String(req.body?.to || "").trim();
      if (!from) {
        res.status(400).json({ error: "Source branch is required" });
        return;
      }

      if (to) {
        runGit(["checkout", to]);
      }
      runGit(["merge", "--no-edit", from]);
      res.json(getGitStatus());
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Unable to merge branch",
      });
    }
  });

  app.post("/api/git-merge", (req, res) => {
    try {
      const from = String(req.body?.from || "").trim();
      const to = String(req.body?.to || "").trim();
      if (!from) {
        res.status(400).json({ error: "Source branch is required" });
        return;
      }

      if (to) {
        runGit(["checkout", to]);
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
