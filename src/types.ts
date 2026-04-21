export interface WizardStep {
  id: string;
  title: string;
  description: string;
  type: 'text' | 'choice' | 'input' | 'ai-prompt';
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

export interface WizardTemplateSummary {
  id: string;
  name: string;
  projectKey: string;
  description: string;
  version: string;
  updatedAt: string;
  stepsCount: number;
}

export interface PromptRefinementResult {
  refinedPrompt: string;
  summary: string;
  suggestions: string[];
  provider: 'gemini' | 'groq';
}

export interface GitStatus {
  available: boolean;
  repoRoot?: string;
  branch: string;
  trackingBranch?: string;
  upstreamConfigured?: boolean;
  latestCommit: string;
  commitMessage: string;
  status: 'clean' | 'dirty' | 'unavailable';
  changedFiles: string[];
  branches: string[];
  aheadCount?: number;
  behindCount?: number;
  hasRemote?: boolean;
  error?: string;
}

export interface DependencyRecord {
  name: string;
  scope: 'dependencies' | 'devDependencies';
  requestedVersion: string;
  installedVersion: string | null;
  status: 'installed' | 'missing';
}
