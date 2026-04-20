import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Loader2, Save, Sparkles } from 'lucide-react';
import PromptEnhancer from './PromptEnhancer';
import { WizardConfig, WizardStep } from '../types';

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

function buildCleanWizard(config: WizardConfig): WizardConfig {
  const firstStep = config.steps[0] || EMPTY_WIZARD.steps[0];
  const shouldResetStarter =
    config.id === 'wizard-starter' &&
    config.name === 'My Custom Wizard' &&
    config.description === 'A reusable multi-step workflow with prompt refinement and export support.';

  if (!shouldResetStarter) {
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

  return EMPTY_WIZARD;
}

export default function WizardCreator() {
  const [config, setConfig] = useState<WizardConfig>(EMPTY_WIZARD);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploadingKnowledge, setIsUploadingKnowledge] = useState(false);
  const knowledgeInputRef = useRef<HTMLInputElement | null>(null);

  const instructionStep = useMemo<WizardStep>(() => config.steps[0] || EMPTY_WIZARD.steps[0], [config]);

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
      setConfig(buildCleanWizard(data.currentWizard as WizardConfig));
      setNotice('');
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load wizard');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadState();
  }, []);

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

  const saveWizard = async () => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/wizards/save', {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save wizard');
      setNotice('');
    } finally {
      setIsSaving(false);
    }
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
      const res = await fetch('/api/knowledge/upload', {
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
    <div className="min-h-screen bg-white px-4 py-10 text-gray-900">
      <div className="mx-auto max-w-[920px]">
        <div className="rounded-[36px] bg-[#f7f9ff] px-6 py-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)] md:px-8">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-200 text-gray-500">
                <Sparkles size={18} />
              </div>
              <h1 className="text-xl font-medium text-gray-800">New Gem</h1>
            </div>

            <button
              onClick={saveWizard}
              className="rounded-full bg-gray-200 px-5 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-300"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
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
              {!config.name && (
                <p className="pt-2 text-xs text-red-500">Your Gem requires a name to start testing.</p>
              )}
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
              <input
                ref={knowledgeInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleKnowledgeUpload}
              />
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
        </div>
      </div>
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
