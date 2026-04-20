import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Copy, GitBranch, Loader2, Sparkles } from 'lucide-react';
import PromptEnhancer from './PromptEnhancer';
import { GitStatus, WizardConfig, WizardStep } from '../types';

type WizardFormData = {
  gemName: string;
  guideTone: string;
  painPoint: string;
  auditRigor: string;
  learningStyle: string;
};

const PREP_STEPS = ['Guide Tone', 'Pain Point', 'Audit Rigor', 'Learning Style', 'Review Inputs', 'Final Page'] as const;

const PREP_STEP_META: Record<number, { title: string; subtitle: string }> = {
  0: {
    title: "Choose your Guide's Tone",
    subtitle: 'This injects the emotional adjectives Gemini-style into the role and behavior sections.',
  },
  1: {
    title: 'Select your Pain Point',
    subtitle: 'This tells the audit where to look for the hidden thread and where to apply the most pressure.',
  },
  2: {
    title: 'Select Audit Rigor',
    subtitle: 'This defines how aggressive the deep-dive rule should be when answers feel weak, vague, or curated.',
  },
  3: {
    title: 'Preferred Learning Style',
    subtitle: 'This adjusts the final format so the synthesis feels more visual, narrative, or action-driven.',
  },
  4: {
    title: 'Review Setup',
    subtitle: 'Check the four prompt levers before we generate the final instructions into the last page.',
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

const PAIN_POINT_OPTIONS = [
  {
    value: 'career_productivity',
    label: 'Career & Productivity',
    description: 'Make the thread analysis bias toward work, execution, discipline, and progress blocks.',
  },
  {
    value: 'health_wellness',
    label: 'Health & Wellness',
    description: 'Focus the diagnosis on energy, recovery, habits, stress load, and physical wellbeing.',
  },
  {
    value: 'personal_relationships',
    label: 'Personal Relationships',
    description: 'Look hardest at attachment, intimacy, communication, and emotional connection patterns.',
  },
  {
    value: 'financial_freedom',
    label: 'Financial Freedom',
    description: 'Trace the thread back to money avoidance, scarcity beliefs, and financial self-trust.',
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
  name: '',
  description: '',
  version: '1.0.0',
  defaultTool: 'No default tool',
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
  gemName: '',
  guideTone: '',
  painPoint: '',
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

function generatePrompt(formData: WizardFormData) {
  const toneLanguage: Record<string, string> = {
    stoic: 'stoic, composed, emotionally steady, and psychologically precise',
    empathetic: 'empathetic, warm, emotionally intelligent, and psychologically insightful',
    no_nonsense: 'direct, blunt when necessary, and unwilling to let the user hide behind polished language',
    clinical: 'clinical, measured, highly analytical, and careful with emotional interpretation',
  };

  const painPointLanguage: Record<string, string> = {
    career_productivity:
      'When identifying the hidden thread, give special weight to the patterns undermining career, focus, execution, consistency, and output.',
    health_wellness:
      'When identifying the hidden thread, give special weight to the patterns undermining energy, health habits, recovery, and nervous system regulation.',
    personal_relationships:
      'When identifying the hidden thread, give special weight to the patterns undermining intimacy, communication, trust, and emotional closeness.',
    financial_freedom:
      'When identifying the hidden thread, give special weight to the patterns undermining money behavior, financial avoidance, self-worth, and long-term stability.',
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
- ${painPointLanguage[formData.painPoint]}

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
  return `Life audit guide with a ${formatLabel(formData.guideTone)} tone, ${formatLabel(
    formData.auditRigor,
  )} rigor, and a focus on ${formatLabel(formData.painPoint)}.`;
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
  const knowledgeInputRef = useRef<HTMLInputElement | null>(null);

  const instructionStep = useMemo<WizardStep>(() => config.steps[0] || EMPTY_WIZARD.steps[0], [config]);
  const isFinalStep = currentStepIndex === PREP_STEPS.length - 1;
  const canProceed =
    currentStepIndex === 0
      ? Boolean(formData.gemName.trim() && formData.guideTone)
      : currentStepIndex === 1
        ? Boolean(formData.painPoint)
        : currentStepIndex === 2
          ? Boolean(formData.auditRigor)
          : currentStepIndex === 3
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
        gemName: loadedWizard.name || current.gemName,
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
      setError(err instanceof Error ? err.message : 'Git action failed');
      setNotice('');
      return false;
    } finally {
      setIsGitLoading(false);
    }
  };

  const handleInitGit = async () => {
    await runGitAction('/api/git-init', {}, 'Git initialized.');
  };

  const handleCreateBranch = async () => {
    if (!branchName.trim()) {
      setError('Enter a branch name first.');
      return;
    }
    await runGitAction('/api/git-branch', { name: branchName.trim() }, `Switched to ${branchName.trim()}.`);
  };

  const handlePull = async () => {
    const saved = await saveWizard();
    if (!saved) {
      return;
    }
    await runGitAction('/api/git-pull', {}, 'Pulled latest changes.');
    await loadState();
  };

  const handleMergeToMain = async () => {
    if (!gitStatus?.branch || gitStatus.branch === 'main') {
      setError('You are already on main.');
      return;
    }
    const checkedOut = await runGitAction('/api/git-checkout', { name: 'main' }, 'Checked out main.');
    if (!checkedOut) {
      return;
    }
    const merged = await runGitAction('/api/git-merge', { from: gitStatus.branch }, `Merged ${gitStatus.branch} into main.`);
    if (!merged) {
      return;
    }
    await runGitAction('/api/git-push', {}, 'Pushed merged changes to origin.');
  };

  const handlePublish = async () => {
    const saved = await saveWizard();
    if (!saved) {
      return;
    }
    const committed = await runGitAction('/api/git-commit', { message: commitMessage.trim() }, 'Changes committed.');
    if (!committed) {
      return;
    }
    await runGitAction('/api/git-push', {}, 'Changes published to remote.');
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
            handlePull,
            handlePublish,
            handleMergeToMain,
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
          <InputField label="Gem Name" value={formData.gemName} onChange={(value) => updateFormData('gemName', value)} />
          <ChoiceCardGroup value={formData.guideTone} options={TONE_OPTIONS} onChange={(value) => updateFormData('guideTone', value)} />
        </div>
      );
    case 1:
      return (
        <ChoiceCardGroup value={formData.painPoint} options={PAIN_POINT_OPTIONS} onChange={(value) => updateFormData('painPoint', value)} />
      );
    case 2:
      return (
        <ChoiceCardGroup value={formData.auditRigor} options={RIGOR_OPTIONS} onChange={(value) => updateFormData('auditRigor', value)} />
      );
    case 3:
      return (
        <ChoiceCardGroup
          value={formData.learningStyle}
          options={LEARNING_STYLE_OPTIONS}
          onChange={(value) => updateFormData('learningStyle', value)}
        />
      );
    case 4:
      return (
        <div className="space-y-4">
          <ReviewRow label="Gem Name" value={formData.gemName} />
          <ReviewRow label="Guide Tone" value={formatLabel(formData.guideTone)} />
          <ReviewRow label="Pain Point" value={formatLabel(formData.painPoint)} />
          <ReviewRow label="Audit Rigor" value={formatLabel(formData.auditRigor)} />
          <ReviewRow label="Learning Style" value={formatLabel(formData.learningStyle)} />
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-700">
            Clicking <strong>Generate Prompt</strong> will keep the current final page layout unchanged and fill it with the generated prompt.
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
  handlePull,
  handlePublish,
  handleMergeToMain,
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
  handlePull: () => Promise<void>;
  handlePublish: () => Promise<void>;
  handleMergeToMain: () => Promise<void>;
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
          <div className="flex items-center justify-between rounded-xl bg-white px-4 py-4 text-sm text-gray-700">
            <span>{config.defaultTool || 'No default tool'}</span>
            <span className="text-gray-400">▼</span>
          </div>
        </div>

        <div>
          <FieldHeader title="Knowledge" />
          <input ref={knowledgeInputRef} type="file" multiple className="hidden" onChange={handleKnowledgeUpload} />
          <button
            type="button"
            onClick={() => knowledgeInputRef.current?.click()}
            className="flex w-full items-center justify-between rounded-xl bg-white px-4 py-4 text-left text-sm text-gray-500"
          >
            <span>
              {isUploadingKnowledge
                ? 'Uploading files...'
                : config.knowledgeFiles.length
                  ? config.knowledgeFiles.join(', ')
                  : 'Add files for your Gem to reference'}
            </span>
            <span className="text-2xl text-gray-500">{isUploadingKnowledge ? '…' : '+'}</span>
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
                onInit={handleInitGit}
                onCreateBranch={handleCreateBranch}
                onPull={handlePull}
                onPublish={handlePublish}
                onMergeToMain={handleMergeToMain}
                onSaveDraft={saveWizard}
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

function InputField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700">{label}</label>
      <input
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
  onInit,
  onCreateBranch,
  onPull,
  onPublish,
  onMergeToMain,
  onSaveDraft,
}: {
  gitStatus: GitStatus | null;
  isLoading: boolean;
  branchName: string;
  commitMessage: string;
  onBranchNameChange: React.Dispatch<React.SetStateAction<string>>;
  onCommitMessageChange: React.Dispatch<React.SetStateAction<string>>;
  onInit: () => Promise<void>;
  onCreateBranch: () => Promise<void>;
  onPull: () => Promise<void>;
  onPublish: () => Promise<void>;
  onMergeToMain: () => Promise<void>;
  onSaveDraft: () => Promise<boolean>;
}) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Version Control</h3>
          <p className="mt-1 text-sm text-slate-500">
            Save draft changes, create a branch, publish to remote, sync latest, and merge back to main.
          </p>
        </div>
        {gitStatus && (
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
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

      {!gitStatus?.available ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm text-slate-600">Initialize git in this workspace to turn on collaboration actions.</p>
          <button
            onClick={onInit}
            disabled={isLoading}
            className="mt-3 rounded-full bg-[#377dff] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {isLoading ? 'Initializing...' : 'Initialize Git'}
          </button>
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <StatusTile label="Current Branch" value={gitStatus.branch} />
            <StatusTile label="Latest Commit" value={gitStatus.latestCommit} />
            <StatusTile label="Ahead / Behind" value={`${gitStatus.aheadCount || 0} / ${gitStatus.behindCount || 0}`} />
            <StatusTile label="Remote" value={gitStatus.hasRemote ? 'Connected' : 'Not set'} />
          </div>

          <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Last Commit</p>
            <p className="mt-1 text-sm text-slate-700">{gitStatus.commitMessage}</p>
            {gitStatus.changedFiles.length > 0 && (
              <p className="mt-2 text-xs text-slate-500">{gitStatus.changedFiles.length} changed file entries waiting in the workspace.</p>
            )}
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <InputField label="Branch Name" value={branchName} onChange={onBranchNameChange} />
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
              onClick={onCreateBranch}
              disabled={isLoading}
              className="rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 disabled:opacity-60"
            >
              {isLoading ? 'Working...' : 'Create Branch'}
            </button>
            <button
              onClick={onPull}
              disabled={isLoading || !gitStatus.hasRemote}
              className="rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 disabled:opacity-60"
            >
              {isLoading ? 'Working...' : 'Sync Latest'}
            </button>
            <button
              onClick={onPublish}
              disabled={isLoading || !gitStatus.hasRemote}
              className="rounded-full bg-[#377dff] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {isLoading ? 'Working...' : 'Publish Changes'}
            </button>
            <button
              onClick={onMergeToMain}
              disabled={isLoading || gitStatus.branch === 'main'}
              className="rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 disabled:opacity-60"
            >
              {isLoading ? 'Working...' : 'Merge to Main'}
            </button>
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
