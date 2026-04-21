import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Copy, GitBranch, Loader2, Sparkles } from 'lucide-react';
import PromptEnhancer from './PromptEnhancer';
import { GitStatus, WizardConfig, WizardStep } from '../types';

type WizardFormData = {
  gemName: string;
  guideTone: string;
  auditRigor: string;
  learningStyle: string;
};

const PREP_STEPS = ['Guide Tone', 'Audit Rigor', 'Learning Style', 'Review Inputs', 'Final Page'] as const;

const PREP_STEP_META: Record<number, { title: string; subtitle: string }> = {
  0: {
    title: "Choose your Guide's Tone",
    subtitle: 'This injects the emotional adjectives Gemini-style into the role and behavior sections.',
  },
  1: {
    title: 'Select Audit Rigor',
    subtitle: 'This defines how aggressive the deep-dive rule should be when answers feel weak, vague, or curated.',
  },
  2: {
    title: 'Preferred Learning Style',
    subtitle: 'This adjusts the final format so the synthesis feels more visual, narrative, or action-driven.',
  },
  3: {
    title: 'Review Setup',
    subtitle: 'Check the three prompt levers before we generate the final instructions into the last page.',
  },
};

const TONE_OPTIONS = [
  {
    value: 'stoic',
    label: 'Stoic',
    description: 'Use calm, disciplined, unsentimental language that feels steady and grounded.',
  },
  {
    value: 'empathetic',
    label: 'Empathetic',
    description: 'Use warmer, more validating language that still stays psychologically clear.',
  },
  {
    value: 'no_nonsense',
    label: 'No-Nonsense',
    description: 'Strip away softeners and challenge the user directly when they are hiding from the truth.',
  },
  {
    value: 'clinical',
    label: 'Clinical',
    description: 'Keep the voice precise, measured, diagnostic, and highly analytical.',
  },
];

const RIGOR_OPTIONS = [
  {
    value: 'supportive',
    label: 'Supportive',
    description: 'Ask one follow-up only when scores drop below 5 or the answer is obviously vague.',
  },
  {
    value: 'balanced',
    label: 'Balanced',
    description: 'Ask one follow-up when scores are below 6 or when the answer feels polished or evasive.',
  },
  {
    value: 'intense',
    label: 'High Rigor',
    description: 'Ask one follow-up when scores are below 7 and challenge curated narratives early.',
  },
];

const LEARNING_STYLE_OPTIONS = [
  {
    value: 'tables',
    label: 'Structured & Visual',
    description: 'Favor tables, category snapshots, compact summaries, and scan-friendly structure.',
  },
  {
    value: 'narrative',
    label: 'Reflective Narrative',
    description: 'Favor flowing explanation, richer interpretation, and deeper written synthesis.',
  },
  {
    value: 'action',
    label: 'Action First',
    description: 'Favor momentum mapping, surgical next steps, and highly practical output.',
  },
];

const EMPTY_WIZARD: WizardConfig = {
  id: 'wizard-starter',
  projectKey: 'default-project',
  name: 'Life Audit',
  description: '',
  version: '1.0.0',
  defaultTool: '',
  knowledgeFiles: [],
  disableKnowledgeCitations: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  branding: {
    primaryColor: '#4f46e5',
    secondaryColor: '#f8fafc',
    borderRadius: '16px',
    fontFamily: 'Inter, sans-serif',
  },
  steps: [
    {
      id: 'step-1',
      title: 'Instructions',
      description: '',
      type: 'ai-prompt',
      content: '',
      placeholder: '',
      required: true,
    },
  ],
};

const DEFAULT_FORM_DATA: WizardFormData = {
  gemName: 'Life Audit',
  guideTone: '',
  auditRigor: '',
  learningStyle: '',
};

function buildCleanWizard(config: WizardConfig): WizardConfig {
  const firstStep = config.steps[0] || EMPTY_WIZARD.steps[0];
  return {
    ...config,
    steps: [
      {
        ...firstStep,
        title: 'Instructions',
        type: 'ai-prompt',
      },
    ],
  };
}

function formatLabel(value: string) {
  return value
    .split('_')
    .map((item) => item.charAt(0).toUpperCase() + item.slice(1))
    .join(' ');
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'wizard'
  );
}

type GitConnection = {
  username: string;
  password: string;
  baseBranch: string;
  selectedBranch: string;
};

const DEFAULT_GIT_CONNECTION: GitConnection = {
  username: '',
  password: '',
  baseBranch: 'main',
  selectedBranch: '',
};

function generatePrompt(formData: WizardFormData) {
  const toneLanguage: Record<string, string> = {
    stoic: 'stoic, composed, emotionally steady, and psychologically precise',
    empathetic: 'empathetic, warm, emotionally intelligent, and psychologically insightful',
    no_nonsense: 'direct, blunt when necessary, and unwilling to let the user hide behind polished language',
    clinical: 'clinical, measured, highly analytical, and careful with emotional interpretation',
  };

  const rigorLanguage: Record<string, string> = {
    supportive:
      'Use a gentle deep-dive rule: ask exactly one insightful follow-up when a score is below 5 or the answer is clearly vague.',
    balanced:
      'Use a balanced deep-dive rule: ask exactly one insightful follow-up when a score is below 6 or the answer feels polished, performative, or evasive.',
    intense:
      'Use a high-rigor deep-dive rule: ask exactly one insightful follow-up when a score is below 7 or whenever the answer sounds curated instead of true.',
  };

  const formatLanguage: Record<string, string> = {
    tables:
      'In the final synthesis, favor markdown structure with a table for Ratings vs. Reality, clean sections, and scan-friendly summaries.',
    narrative:
      'In the final synthesis, favor a more narrative and reflective report with richer interpretation and flowing explanation.',
    action:
      'In the final synthesis, favor a practical format with concise sections, surgical recommendations, and strong momentum mapping.',
  };

  return `You are the Radical Clarity Architect, a world-class life strategist and behavioral psychologist with over 25 years of experience in cognitive behavioral work, performance coaching, and systems thinking.

Overall tone:
- Be ${toneLanguage[formData.guideTone]}.

Core objective:
- Conduct a profound diagnostic Life Audit across Physical Health, Mental Health, Romantic Relationships, Friendships, Career Fulfillment, Finances, and Fun.
- Help the user move from being inside the problem to observing the problem from the outside.

Phase 1: The Extraction
- Begin by telling the user: "Don't perform. Write what's actually true; the messier the better."
- Ask the user for their tone preference first.
- Evaluate the seven life areas one at a time, not all at once.
- For each area, ask for a rating from 1 to 10.
- Ask for a brutally honest description of their current reality.
- When useful, present common answer patterns but leave room for custom input.
- ${rigorLanguage[formData.auditRigor]}
- Validate briefly after each answer, but do not analyze until all seven areas are complete.

Phase 2: The Synthesis
- Identify the single most damaging core belief limiting the user.
- Identify the hidden thread connecting their different failures or stuck points.
- Expose contradictions using the phrasing: "Your ego says [X], but the data suggests [Y]."
- For each life area, identify one specific, high-leverage momentum move.
- End with the reminder: "This is the map; now go find your people."

Formatting:
- ${formatLanguage[formData.learningStyle]}
- Use bold category names during the audit.
- Use markdown headings for the synthesis sections.

Safety:
- This is a self-reflection and coaching tool, not therapy or clinical diagnosis.

Start the audit now.`;
}

function generateDescription(formData: WizardFormData) {
  return `Life audit guide with a ${formatLabel(formData.guideTone)} tone and ${formatLabel(
    formData.auditRigor,
  )} rigor.`;
}

export default function WizardCreator() {
  const [config, setConfig] = useState<WizardConfig>(EMPTY_WIZARD);
  const [formData, setFormData] = useState<WizardFormData>(DEFAULT_FORM_DATA);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploadingKnowledge, setIsUploadingKnowledge] = useState(false);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [isGitLoading, setIsGitLoading] = useState(false);
  const [isGitModalOpen, setIsGitModalOpen] = useState(false);
  const [branchName, setBranchName] = useState('feature/life-audit-update');
  const [commitMessage, setCommitMessage] = useState('Update wizard flow');
  const [gitConnection, setGitConnection] = useState<GitConnection>(DEFAULT_GIT_CONNECTION);
  const knowledgeInputRef = useRef<HTMLInputElement | null>(null);

  const instructionStep = useMemo<WizardStep>(() => config.steps[0] || EMPTY_WIZARD.steps[0], [config]);
  const isFinalStep = currentStepIndex === PREP_STEPS.length - 1;
  const canProceed =
    currentStepIndex === 0
      ? Boolean(formData.guideTone)
      : currentStepIndex === 1
        ? Boolean(formData.auditRigor)
        : currentStepIndex === 2
          ? Boolean(formData.learningStyle)
          : true;

  const readJson = async (res: Response) => {
    const text = await res.text();
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      throw new Error(
        'API returned HTML instead of JSON. Redeploy on Vercel after adding the `api/` routes and `vercel.json`.',
      );
    }
  };

  const loadState = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/wizards');
      const data = await readJson(res);
      if (!res.ok) {
        throw new Error(data.error || 'Unable to load wizard');
      }
      const loadedWizard = buildCleanWizard(data.currentWizard as WizardConfig);
      setConfig(loadedWizard);
      setFormData((current) => ({
        ...current,
        gemName: loadedWizard.name || current.gemName || DEFAULT_FORM_DATA.gemName,
      }));
      setNotice('');
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load wizard');
    } finally {
      setIsLoading(false);
    }
  };

  const loadGitStatus = async () => {
    try {
      const res = await fetch('/api/git-status');
      const data = (await readJson(res)) as GitStatus & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Unable to load git status');
      }
      setGitStatus(data);
      setGitConnection((current) => ({
        ...current,
        selectedBranch: data.branch && data.branch !== 'not-initialized' && data.branch !== 'error' ? data.branch : current.selectedBranch,
        baseBranch:
          current.baseBranch ||
          (data.branches.includes('main') ? 'main' : data.branches.includes('master') ? 'master' : current.baseBranch),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load git status');
    }
  };

  useEffect(() => {
    loadState();
    loadGitStatus();
  }, []);

  useEffect(() => {
    setBranchName(`feature/${slugify(config.name || formData.gemName || 'wizard')}`);
    setCommitMessage(`Update ${config.name || formData.gemName || 'wizard'} flow`);
  }, [config.name, formData.gemName]);

  useEffect(() => {
    const stored = window.localStorage.getItem('wizardengine-git-connection');
    if (!stored) {
      return;
    }

    try {
      const parsed = JSON.parse(stored) as Partial<GitConnection>;
      setGitConnection((current) => ({
        ...current,
        ...parsed,
      }));
    } catch {
      // Ignore invalid cached data.
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      'wizardengine-git-connection',
      JSON.stringify(gitConnection),
    );
  }, [gitConnection]);

  const updateConfig = (updates: Partial<WizardConfig>) => {
    setConfig((current) => ({
      ...current,
      ...updates,
      updatedAt: new Date().toISOString(),
    }));
  };

  const updateInstructions = (value: string) => {
    setConfig((current) => ({
      ...current,
      steps: [
        {
          ...instructionStep,
          description: value,
          title: 'Instructions',
          type: 'ai-prompt',
        },
      ],
      updatedAt: new Date().toISOString(),
    }));
  };

  const updateFormData = <K extends keyof WizardFormData>(key: K, value: WizardFormData[K]) => {
    setFormData((current) => ({ ...current, [key]: value }));
  };

  const syncGeneratedPrompt = () => {
    const prompt = generatePrompt(formData);
    setConfig((current) => ({
      ...current,
      name: formData.gemName,
      description: generateDescription(formData),
      steps: [
        {
          ...instructionStep,
          description: prompt,
          title: 'Instructions',
          type: 'ai-prompt',
        },
      ],
      updatedAt: new Date().toISOString(),
    }));
  };

  const startOver = () => {
    setFormData(DEFAULT_FORM_DATA);
    setCurrentStepIndex(0);
    setNotice('');
    setError('');
    setConfig((current) => ({
      ...current,
      name: '',
      description: '',
      steps: [
        {
          ...(current.steps[0] || EMPTY_WIZARD.steps[0]),
          title: 'Instructions',
          type: 'ai-prompt',
          description: '',
        },
      ],
      updatedAt: new Date().toISOString(),
    }));
  };

  const goNext = () => {
    if (currentStepIndex === PREP_STEPS.length - 2) {
      syncGeneratedPrompt();
    }
    setCurrentStepIndex((current) => Math.min(current + 1, PREP_STEPS.length - 1));
  };

  const saveWizard = async () => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/wizards-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      });
      const data = await readJson(res);
      if (!res.ok) {
        throw new Error(data.error || 'Unable to save wizard');
      }
      setConfig(buildCleanWizard(data.wizard));
      setNotice('Wizard saved.');
      setError('');
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save wizard');
      setNotice('');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const updateGitConnection = <K extends keyof GitConnection>(key: K, value: GitConnection[K]) => {
    setGitConnection((current) => ({ ...current, [key]: value }));
  };

  const runGitAction = async (
    endpoint: string,
    payload?: Record<string, unknown>,
    successMessage?: string,
  ) => {
    setIsGitLoading(true);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {}),
      });
      const data = await readJson(res);
      if (!res.ok) {
        throw new Error(data.error || 'Git action failed');
      }

      const nextStatus = (data.status || data) as GitStatus;
      setGitStatus(nextStatus);
      if (successMessage) {
        setNotice(successMessage);
      }
      setError('');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Git action failed';
      setError(message);
      setNotice('');
      return false;
    } finally {
      setIsGitLoading(false);
    }
  };

  const gitAuthPayload = () => ({
    username: gitConnection.username.trim(),
    password: gitConnection.password,
  });

  const handleInitGit = async () => {
    await runGitAction('/api/git-init', {}, 'Git repository is ready.');
  };

  const handleCreateBranch = async () => {
    if (!branchName.trim()) {
      setError('Add a branch name first.');
      return;
    }
    const saved = await saveWizard();
    if (!saved) {
      return;
    }
    await runGitAction(
      '/api/git-branch',
      {
        name: branchName.trim(),
      },
      `Created and switched to ${branchName.trim()}.`,
    );
  };

  const handleCheckoutBranch = async () => {
    if (!gitConnection.selectedBranch.trim()) {
      setError('Choose a branch to switch to.');
      return;
    }
    await runGitAction(
      '/api/git-checkout',
      { name: gitConnection.selectedBranch.trim() },
      `Switched to ${gitConnection.selectedBranch.trim()}.`,
    );
  };

  const handleFetch = async () => {
    await runGitAction('/api/git-fetch', gitAuthPayload(), 'Fetched latest branches and remote updates.');
  };

  const handlePull = async () => {
    await runGitAction('/api/git-pull', gitAuthPayload(), 'Downloaded the latest changes for this branch.');
  };

  const handleMergeToMain = async () => {
    if (!gitStatus?.branch) {
      setError('Git status is not loaded yet.');
      return;
    }
    const targetBranch = gitConnection.baseBranch.trim() || 'main';
    if (targetBranch === gitStatus.branch) {
      setError('Choose a different merge target than the current branch.');
      return;
    }
    await runGitAction(
      '/api/git-merge',
      {
        from: gitStatus.branch,
        to: targetBranch,
      },
      `Merged ${gitStatus.branch} into ${targetBranch}.`,
    );
  };

  const handleCommit = async () => {
    const saved = await saveWizard();
    if (!saved) {
      return;
    }
    await runGitAction(
      '/api/git-commit',
      {
        message: commitMessage.trim() || 'Update wizard',
        ...gitAuthPayload(),
      },
      `Committed changes on ${gitStatus?.branch || 'the current branch'}.`,
    );
  };

  const handlePush = async () => {
    await runGitAction(
      '/api/git-push',
      gitAuthPayload(),
      `Uploaded ${gitStatus?.branch || 'the current branch'} to the remote repository.`,
    );
  };

  const copyText = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    setNotice(`${label} copied.`);
    setError('');
  };

  const readFileAsBase64 = (file: File) =>
    new Promise<{ name: string; content: string }>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        resolve({ name: file.name, content: base64 });
      };
      reader.onerror = () => reject(new Error(`Unable to read ${file.name}`));
      reader.readAsDataURL(file);
    });

  const handleKnowledgeUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) {
      return;
    }

    setIsUploadingKnowledge(true);
    try {
      const payloadFiles = await Promise.all(files.map(readFileAsBase64));
      const res = await fetch('/api/knowledge-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wizardId: config.id,
          files: payloadFiles,
        }),
      });
      const data = await readJson(res);
      if (!res.ok) {
        throw new Error(data.error || 'Unable to upload files');
      }

      setConfig(buildCleanWizard(data.wizard as WizardConfig));
      setNotice(`${data.uploaded.length} file${data.uploaded.length > 1 ? 's' : ''} uploaded.`);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to upload files');
      setNotice('');
    } finally {
      setIsUploadingKnowledge(false);
      event.target.value = '';
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
          <Loader2 size={18} className="animate-spin text-indigo-600" />
          <span className="text-sm text-gray-600">Loading wizard...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#eef4ff_0%,#f8fbff_35%,#ffffff_75%)] px-4 py-10 text-gray-900">
      <div className="mx-auto max-w-[920px]">
        {!isFinalStep && (
          <div className="mx-auto mb-6 max-w-[430px] overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.14)]">
            <div className="bg-[#121a2f] px-6 py-5 text-white">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#377dff] text-white shadow-[0_6px_18px_rgba(55,125,255,0.35)]">
                  <Sparkles size={15} />
                </div>
                <div>
                  <h1 className="text-[1.35rem] font-semibold tracking-[-0.02em]">Coach Architect</h1>
                  <p className="mt-1 text-xs text-slate-300">
                    Step {currentStepIndex + 1} of {PREP_STEPS.length - 1}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between text-[11px] text-slate-400">
                <span>{PREP_STEPS[currentStepIndex]}</span>
                <span>{Math.round((currentStepIndex / (PREP_STEPS.length - 1)) * 100)}% Complete</span>
              </div>

              <div className="mt-2 h-1.5 rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-[#377dff] transition-all"
                  style={{ width: `${(currentStepIndex / (PREP_STEPS.length - 1)) * 100}%` }}
                />
              </div>
            </div>

            <div className="px-6 py-6">
              <div className="mb-6">
                <h2 className="text-[1.1rem] font-semibold tracking-[-0.02em] text-[#1d2a44]">
                  {PREP_STEP_META[currentStepIndex]?.title}
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  {PREP_STEP_META[currentStepIndex]?.subtitle}
                </p>
              </div>

              <div>{renderPrepStep(currentStepIndex, formData, updateFormData)}</div>
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 px-6 py-4">
              <button
                onClick={() => setCurrentStepIndex((current) => Math.max(current - 1, 0))}
                disabled={currentStepIndex === 0}
                className="inline-flex items-center gap-2 rounded-full px-2 py-2 text-sm font-medium text-slate-400 disabled:opacity-40"
              >
                <ChevronLeft size={16} />
                Back
              </button>

              <div className="flex items-center gap-3">
                {currentStepIndex === PREP_STEPS.length - 2 && (
                  <button
                    onClick={startOver}
                    className="rounded-full bg-white px-4 py-2.5 text-sm font-medium text-slate-500 ring-1 ring-slate-200 transition-colors hover:text-slate-700"
                  >
                    Start over
                  </button>
                )}
                <button
                  onClick={goNext}
                  disabled={!canProceed}
                  className="inline-flex items-center gap-2 rounded-full bg-[#377dff] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(55,125,255,0.3)] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0"
                >
                  {currentStepIndex === PREP_STEPS.length - 2 ? 'Generate Prompt' : 'Next'}
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
        )}

        {isFinalStep &&
          renderFinalPage({
            config,
            instructionStep,
            notice,
            error,
            isSaving,
            isUploadingKnowledge,
            gitStatus,
            isGitLoading,
            branchName,
            commitMessage,
            knowledgeInputRef,
            updateConfig,
            updateInstructions,
            saveWizard,
            copyText,
            handleKnowledgeUpload,
            setBranchName,
            setCommitMessage,
            handleInitGit,
            handleCreateBranch,
            handleCheckoutBranch,
            handleFetch,
            handlePull,
            handleCommit,
            handlePush,
            handleMergeToMain,
            gitConnection,
            updateGitConnection,
            isGitModalOpen,
            setIsGitModalOpen,
            startOver,
            goBack: () => setCurrentStepIndex(PREP_STEPS.length - 2),
          })}
      </div>
    </div>
  );
}

function renderPrepStep(
  stepIndex: number,
  formData: WizardFormData,
  updateFormData: <K extends keyof WizardFormData>(key: K, value: WizardFormData[K]) => void,
) {
  switch (stepIndex) {
    case 0:
      return (
        <div className="space-y-4">
          <ChoiceCardGroup value={formData.guideTone} options={TONE_OPTIONS} onChange={(value) => updateFormData('guideTone', value)} />
        </div>
      );
    case 1:
      return (
        <ChoiceCardGroup value={formData.auditRigor} options={RIGOR_OPTIONS} onChange={(value) => updateFormData('auditRigor', value)} />
      );
    case 2:
      return (
        <ChoiceCardGroup
          value={formData.learningStyle}
          options={LEARNING_STYLE_OPTIONS}
          onChange={(value) => updateFormData('learningStyle', value)}
        />
      );
    case 3:
      return (
        <div className="space-y-4">
          <ReviewRow label="Guide Tone" value={formatLabel(formData.guideTone)} />
          <ReviewRow label="Audit Rigor" value={formatLabel(formData.auditRigor)} />
          <ReviewRow label="Learning Style" value={formatLabel(formData.learningStyle)} />
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-700">
            Click <strong>Generate Prompt</strong>.
          </div>
        </div>
      );
    default:
      return null;
  }
}

function renderFinalPage({
  config,
  instructionStep,
  notice,
  error,
  isSaving,
  isUploadingKnowledge,
  gitStatus,
  isGitLoading,
  branchName,
  commitMessage,
  knowledgeInputRef,
  updateConfig,
  updateInstructions,
  saveWizard,
  copyText,
  handleKnowledgeUpload,
  setBranchName,
  setCommitMessage,
  handleInitGit,
  handleCreateBranch,
  handleCheckoutBranch,
  handleFetch,
  handlePull,
  handleCommit,
  handlePush,
  handleMergeToMain,
  gitConnection,
  updateGitConnection,
  isGitModalOpen,
  setIsGitModalOpen,
  startOver,
  goBack,
}: {
  config: WizardConfig;
  instructionStep: WizardStep;
  notice: string;
  error: string;
  isSaving: boolean;
  isUploadingKnowledge: boolean;
  gitStatus: GitStatus | null;
  isGitLoading: boolean;
  branchName: string;
  commitMessage: string;
  knowledgeInputRef: React.RefObject<HTMLInputElement | null>;
  updateConfig: (updates: Partial<WizardConfig>) => void;
  updateInstructions: (value: string) => void;
  saveWizard: () => Promise<boolean>;
  copyText: (value: string, label: string) => Promise<void>;
  handleKnowledgeUpload: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  setBranchName: React.Dispatch<React.SetStateAction<string>>;
  setCommitMessage: React.Dispatch<React.SetStateAction<string>>;
  handleInitGit: () => Promise<void>;
  handleCreateBranch: () => Promise<void>;
  handleCheckoutBranch: () => Promise<void>;
  handleFetch: () => Promise<void>;
  handlePull: () => Promise<void>;
  handleCommit: () => Promise<void>;
  handlePush: () => Promise<void>;
  handleMergeToMain: () => Promise<void>;
  gitConnection: GitConnection;
  updateGitConnection: <K extends keyof GitConnection>(key: K, value: GitConnection[K]) => void;
  isGitModalOpen: boolean;
  setIsGitModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  startOver: () => void;
  goBack: () => void;
}) {
  return (
    <div className="rounded-[36px] bg-[#f7f9ff] px-6 py-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)] md:px-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-200 text-gray-500">
            <Sparkles size={18} />
          </div>
          <h1 className="text-xl font-medium text-gray-800">New Gem</h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsGitModalOpen(true)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-600 transition-colors hover:bg-gray-100"
            title="Git"
          >
            <GitBranch size={18} />
          </button>
          <button onClick={goBack} className="rounded-full bg-white px-4 py-2 text-sm font-medium text-gray-600">
            Back
          </button>
          <button onClick={startOver} className="rounded-full bg-white px-4 py-2 text-sm font-medium text-gray-600">
            Start over
          </button>
          <button
            onClick={saveWizard}
            className="rounded-full bg-gray-200 px-5 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-300"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {notice && <div className="mb-4 rounded-2xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700">{notice}</div>}
      {error && <div className="mb-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="space-y-7 rounded-[28px] bg-[#f7f9ff]">
        <FieldHeader title="Name" canCopy onCopy={() => copyText(config.name, 'Name')} />
        <div>
          <div className="relative">
            <input
              value={config.name}
              onChange={(e) => updateConfig({ name: e.target.value })}
              placeholder="Give your Gem a name"
              className={`w-full rounded-xl border bg-white px-4 py-4 text-lg outline-none ${
                config.name ? 'border-gray-200' : 'border-red-500'
              }`}
            />
            {!config.name && (
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-lg font-bold text-red-500">!</span>
            )}
          </div>
          {!config.name && <p className="pt-2 text-xs text-red-500">Your Gem requires a name to start testing.</p>}
        </div>

        <div>
          <FieldHeader title="Description" canCopy onCopy={() => copyText(config.description, 'Description')} />
          <textarea
            value={config.description}
            onChange={(e) => updateConfig({ description: e.target.value })}
            placeholder="Describe your Gem and explain what it does"
            className="min-h-[86px] w-full rounded-xl border border-gray-200 bg-white px-4 py-4 text-sm outline-none"
          />
        </div>

        <div>
          <FieldHeader title="Instructions" canCopy onCopy={() => copyText(instructionStep.description, 'Instructions')} />
          <PromptEnhancer
            historyKey={instructionStep.id}
            value={instructionStep.description}
            onChange={updateInstructions}
            placeholder=""
          />
        </div>

        <div>
          <FieldHeader title="Default tool" />
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-100 px-4 py-4 text-sm text-slate-400">
            <span>{config.defaultTool && config.defaultTool !== 'No default tool' ? config.defaultTool : 'Select from the Gemini Gem'}</span>
            <span className="text-slate-300">▼</span>
          </div>
        </div>

        <div>
          <FieldHeader title="Knowledge" />
          <input ref={knowledgeInputRef} type="file" multiple className="hidden" onChange={handleKnowledgeUpload} />
          <button
            type="button"
            onClick={() => knowledgeInputRef.current?.click()}
            className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-100 px-4 py-4 text-left text-sm text-slate-400"
          >
            <span>
              {isUploadingKnowledge
                ? 'Uploading files...'
                : config.knowledgeFiles.length
                  ? config.knowledgeFiles.join(', ')
                  : 'Choose knowledge from the Gemini Gem'}
            </span>
            <span className="text-2xl text-slate-300">{isUploadingKnowledge ? '…' : '+'}</span>
          </button>
        </div>

        <label className="flex items-center gap-3 text-sm text-gray-500">
          <input
            type="checkbox"
            checked={config.disableKnowledgeCitations}
            onChange={(e) => updateConfig({ disableKnowledgeCitations: e.target.checked })}
            className="h-4 w-4"
          />
          <span>Disable Knowledge Citations</span>
        </label>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 pt-6">
        <button onClick={goBack} className="rounded-full bg-white px-4 py-2 text-sm font-medium text-gray-600">
          Back
        </button>
        <button onClick={startOver} className="rounded-full bg-white px-4 py-2 text-sm font-medium text-gray-600">
          Start over
        </button>
        <button
          onClick={saveWizard}
          className="rounded-full bg-gray-200 px-5 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-300"
        >
          {isSaving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {isGitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-6">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-[28px] bg-white shadow-[0_30px_80px_rgba(15,23,42,0.25)]">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Git</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Branch, sync, publish, and merge your wizard changes from one place.
                </p>
              </div>
              <button
                onClick={() => setIsGitModalOpen(false)}
                className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600"
              >
                Close
              </button>
            </div>

            <div className="p-6">
              <GitPanel
                gitStatus={gitStatus}
                isLoading={isGitLoading}
                branchName={branchName}
                commitMessage={commitMessage}
                onBranchNameChange={setBranchName}
                onCommitMessageChange={setCommitMessage}
                onInitGit={handleInitGit}
                onCreateBranch={handleCreateBranch}
                onCheckoutBranch={handleCheckoutBranch}
                onFetch={handleFetch}
                onPull={handlePull}
                onCommit={handleCommit}
                onPush={handlePush}
                onMergeToMain={handleMergeToMain}
                onSaveDraft={saveWizard}
                gitConnection={gitConnection}
                onGitConnectionChange={updateGitConnection}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FieldHeader({
  title,
  canCopy = false,
  onCopy,
}: {
  title: string;
  canCopy?: boolean;
  onCopy?: () => void;
}) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        <span className="flex h-4 w-4 items-center justify-center rounded-full border border-gray-300 text-[10px] text-gray-400">
          i
        </span>
      </div>
      {canCopy && onCopy && (
        <button onClick={onCopy} className="inline-flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-indigo-600">
          <Copy size={12} />
          Copy
        </button>
      )}
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: React.HTMLInputTypeAttribute;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-700 outline-none transition-colors focus:border-[#377dff]"
      />
    </div>
  );
}

function ChoiceCardGroup({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<{ value: string; label: string; description: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-3">
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`rounded-2xl border px-4 py-4 text-left transition-all ${
              active
                ? 'border-[#9dbdff] bg-[#eef4ff] shadow-[0_8px_18px_rgba(55,125,255,0.08)]'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className={`text-sm font-semibold ${active ? 'text-[#214ea5]' : 'text-slate-700'}`}>{option.label}</p>
                <p className="mt-1 text-sm leading-6 text-slate-500">{option.description}</p>
              </div>
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                  active ? 'bg-[#377dff] text-white' : 'bg-slate-100 text-transparent'
                }`}
              >
                <Check size={12} />
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-1 text-sm text-slate-700">{value}</p>
    </div>
  );
}

function GitPanel({
  gitStatus,
  isLoading,
  branchName,
  commitMessage,
  onBranchNameChange,
  onCommitMessageChange,
  onInitGit,
  onCreateBranch,
  onCheckoutBranch,
  onFetch,
  onPull,
  onCommit,
  onPush,
  onMergeToMain,
  onSaveDraft,
  gitConnection,
  onGitConnectionChange,
}: {
  gitStatus: GitStatus | null;
  isLoading: boolean;
  branchName: string;
  commitMessage: string;
  onBranchNameChange: React.Dispatch<React.SetStateAction<string>>;
  onCommitMessageChange: React.Dispatch<React.SetStateAction<string>>;
  onInitGit: () => Promise<void>;
  onCreateBranch: () => Promise<void>;
  onCheckoutBranch: () => Promise<void>;
  onFetch: () => Promise<void>;
  onPull: () => Promise<void>;
  onCommit: () => Promise<void>;
  onPush: () => Promise<void>;
  onMergeToMain: () => Promise<void>;
  onSaveDraft: () => Promise<boolean>;
  gitConnection: GitConnection;
  onGitConnectionChange: <K extends keyof GitConnection>(key: K, value: GitConnection[K]) => void;
}) {
  const isRepoReady = Boolean(gitStatus?.available);
  const hasBranches = Boolean(gitStatus?.branches.length);
  const currentBranch = gitStatus?.branch || 'not-initialized';
  const branchNeedsPushFirst = Boolean(gitStatus?.hasRemote && !gitStatus?.upstreamConfigured);
  const mergeTargetOptions = gitStatus?.branches?.length
    ? gitStatus.branches
    : gitConnection.baseBranch
      ? [gitConnection.baseBranch]
      : [];

  return (
    <div className="rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-5 shadow-[0_18px_40px_rgba(15,23,42,0.05)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold tracking-[-0.02em] text-slate-900">Git Workspace</h3>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
            Keep this beginner-friendly: see where you are, save your draft, create a branch, commit, pull, push, and
            merge back into your target branch from one place.
          </p>
        </div>
        {gitStatus && (
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              gitStatus.status === 'dirty'
                ? 'bg-amber-50 text-amber-700'
                : gitStatus.status === 'clean'
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-slate-100 text-slate-600'
            }`}
          >
            {gitStatus.status === 'unavailable' ? 'Git unavailable' : gitStatus.status === 'dirty' ? 'Unsaved git changes' : 'Up to date'}
          </span>
        )}
      </div>

      {!isRepoReady ? (
        <div className="mt-5 rounded-[24px] border border-slate-200 bg-white p-5">
          <p className="text-sm font-semibold text-slate-800">This folder is not a Git repository yet.</p>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Start here once, then the rest of the branch, commit, pull, push, and merge controls will light up.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              onClick={onInitGit}
              disabled={isLoading}
              className="rounded-full bg-[#377dff] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {isLoading ? 'Working...' : 'Initialize Git'}
            </button>
            <button
              onClick={() => void onSaveDraft()}
              disabled={isLoading}
              className="rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 disabled:opacity-60"
            >
              Save Draft
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <StatusTile label="Current Branch" value={gitStatus.branch} />
            <StatusTile label="Tracking" value={gitStatus.upstreamConfigured ? gitStatus.trackingBranch || 'Connected' : 'Not linked yet'} />
            <StatusTile label="Latest Commit" value={gitStatus.latestCommit} />
            <StatusTile label="Ahead / Behind" value={`${gitStatus.aheadCount || 0} / ${gitStatus.behindCount || 0}`} />
            <StatusTile label="Remote" value={gitStatus.hasRemote ? 'Connected' : 'Not Connected'} />
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-[24px] border border-slate-200 bg-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Repository Overview</p>
                  <p className="mt-1 text-sm text-slate-500">
                    Check your current branch, the last commit, and anything waiting to be committed.
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                  {gitStatus.repoRoot ? 'Server repo ready' : 'Repo ready'}
                </span>
              </div>

              <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Last Commit</p>
                <p className="mt-1 text-sm text-slate-700">{gitStatus.commitMessage}</p>
              </div>

              <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Changed Files</p>
                  <span className="text-xs text-slate-500">{gitStatus.changedFiles.length} pending</span>
                </div>
                {gitStatus.changedFiles.length ? (
                  <div className="mt-3 max-h-44 space-y-2 overflow-y-auto pr-1">
                    {gitStatus.changedFiles.map((file) => (
                      <div key={file} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                        {file}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-500">No local file changes are waiting right now.</p>
                )}
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-[#f8fbff] p-5">
              <p className="text-sm font-semibold text-slate-800">Credentials & Merge Target</p>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Keep these for HTTPS remotes. For GitHub, the password field should hold a personal access token.
              </p>

              <div className="mt-4 grid gap-4">
                <InputField
                  label="Git Username"
                  value={gitConnection.username}
                  onChange={(value) => onGitConnectionChange('username', value)}
                />
                <InputField
                  label="Git Password / Token"
                  type="password"
                  value={gitConnection.password}
                  onChange={(value) => onGitConnectionChange('password', value)}
                />
                <SelectField
                  label="Merge Into"
                  value={gitConnection.baseBranch}
                  onChange={(value) => onGitConnectionChange('baseBranch', value)}
                  options={mergeTargetOptions}
                  placeholder="Choose a target branch"
                />
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-[24px] border border-slate-200 bg-white p-5">
            <p className="text-sm font-semibold text-slate-800">Work On Branches</p>
            <p className="mt-1 text-sm text-slate-500">
              Create a new branch for your work, or switch to an existing one before you start editing.
            </p>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <InputField label="New Branch Name" value={branchName} onChange={onBranchNameChange} />
              <SelectField
                label="Switch To Branch"
                value={gitConnection.selectedBranch}
                onChange={(value) => onGitConnectionChange('selectedBranch', value)}
                options={gitStatus.branches}
                placeholder={hasBranches ? 'Choose a branch' : 'No branches found'}
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                onClick={onCreateBranch}
                disabled={isLoading}
                className="rounded-full bg-[#377dff] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {isLoading ? 'Working...' : 'Create Branch'}
              </button>
              <button
                onClick={onCheckoutBranch}
                disabled={isLoading || !hasBranches || gitConnection.selectedBranch === currentBranch}
                className="rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 disabled:opacity-60"
              >
                {isLoading ? 'Working...' : 'Switch Branch'}
              </button>
              <button
                onClick={onFetch}
                disabled={isLoading || !gitStatus.hasRemote}
                className="rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 disabled:opacity-60"
              >
                {isLoading ? 'Working...' : 'Fetch Latest'}
              </button>
              <button
                onClick={onPull}
                disabled={isLoading || !gitStatus.hasRemote || branchNeedsPushFirst}
                className="rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 disabled:opacity-60"
              >
                {isLoading ? 'Working...' : 'Pull Changes'}
              </button>
            </div>
            {branchNeedsPushFirst && (
              <p className="mt-3 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                This branch is local only right now. Click <strong>Push Branch</strong> once to link it to the remote, or switch to
                `main` before pulling.
              </p>
            )}
          </div>

          <div className="mt-5 rounded-[24px] border border-slate-200 bg-white p-5">
            <p className="text-sm font-semibold text-slate-800">Save And Publish Your Work</p>
            <p className="mt-1 text-sm text-slate-500">
              Save the wizard, write a commit message, commit your changes, then push the current branch to the remote.
            </p>

            <div className="mt-4">
              <InputField label="Commit Message" value={commitMessage} onChange={onCommitMessageChange} />
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                onClick={() => void onSaveDraft()}
                disabled={isLoading}
                className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-60"
              >
                Save Draft
              </button>
              <button
                onClick={onCommit}
                disabled={isLoading}
                className="rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 disabled:opacity-60"
              >
                {isLoading ? 'Working...' : 'Commit Changes'}
              </button>
              <button
                onClick={onPush}
                disabled={isLoading || !gitStatus.hasRemote}
                className="rounded-full bg-[#377dff] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {isLoading ? 'Working...' : 'Push Branch'}
              </button>
              <button
                onClick={onMergeToMain}
                disabled={isLoading || !gitConnection.baseBranch || gitConnection.baseBranch === currentBranch}
                className="rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 disabled:opacity-60"
              >
                {isLoading ? 'Working...' : `Merge Into ${gitConnection.baseBranch || 'Target'}`}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatusTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-700">{value}</p>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</span>
      <div className="relative">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full appearance-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-[#377dff]"
        >
          <option value="">{placeholder || 'Select an option'}</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate-400">▼</span>
      </div>
    </label>
  );
}
