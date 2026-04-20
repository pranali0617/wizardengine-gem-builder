import React, { useEffect, useState } from 'react';
import { Loader2, Redo2, Undo2, WandSparkles } from 'lucide-react';

interface PromptEnhancerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  historyKey?: string;
}

export default function PromptEnhancer({ value, onChange, placeholder, historyKey }: PromptEnhancerProps) {
  const [history, setHistory] = useState<string[]>([value]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [isImproving, setIsImproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setHistory([value]);
    setHistoryIndex(0);
    setError(null);
  }, [historyKey]);

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    // Update history when user types directly
    if (history[historyIndex] !== newValue) {
      const newHistory = [...history.slice(0, historyIndex + 1), newValue];
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    }
    onChange(newValue);
  };

  const pushHistory = (nextValue: string) => {
    const nextHistory = history.slice(0, historyIndex + 1);
    nextHistory.push(nextValue);
    setHistory(nextHistory);
    setHistoryIndex(nextHistory.length - 1);
    onChange(nextValue);
  };

  const refinePrompt = async () => {
    if (!value.trim()) {
      return;
    }

    setIsImproving(true);
    setError(null);

    try {
      const res = await fetch('/api/prompt-refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: value,
          currentPrompt: value,
        }),
      });

      const text = await res.text();
      let data: any;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error('API returned HTML instead of JSON. Redeploy on Vercel after adding the `api/` routes.');
      }
      if (!res.ok) {
        throw new Error(data.error || 'Unable to refine prompt');
      }

      if (data.refinedPrompt) {
        pushHistory(data.refinedPrompt);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to refine prompt');
    } finally {
      setIsImproving(false);
    }
  };

  const undo = () => {
    if (historyIndex > 0) {
      const nextIndex = historyIndex - 1;
      setHistoryIndex(nextIndex);
      onChange(history[nextIndex]);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      setHistoryIndex(nextIndex);
      onChange(history[nextIndex]);
    }
  };

  return (
    <div>
      <div className="overflow-hidden rounded-2xl border border-transparent bg-white">
        <textarea
          value={value}
          onChange={handleTextareaChange}
          placeholder={placeholder}
          className="min-h-[260px] w-full resize-none border-none bg-white px-4 py-4 text-sm leading-8 text-gray-700 outline-none"
        />

        <div className="flex items-center gap-2 px-3 pb-3">
          <button
            onClick={undo}
            disabled={historyIndex === 0}
            className="rounded-full bg-gray-100 p-2.5 text-gray-400 transition-colors hover:bg-gray-200 disabled:opacity-40"
            title="Undo"
          >
            <Undo2 size={18} />
          </button>
          <button
            onClick={redo}
            disabled={historyIndex >= history.length - 1}
            className="rounded-full bg-gray-100 p-2.5 text-gray-400 transition-colors hover:bg-gray-200 disabled:opacity-40"
            title="Redo"
          >
            <Redo2 size={18} />
          </button>
          <button
            onClick={refinePrompt}
            disabled={isImproving || !value.trim()}
            className="rounded-full bg-gray-100 p-2.5 text-gray-400 transition-colors hover:bg-indigo-100 hover:text-indigo-600 disabled:opacity-40"
            title="Refine with AI"
          >
            {isImproving ? <Loader2 size={18} className="animate-spin" /> : <WandSparkles size={18} />}
          </button>
        </div>
      </div>

      {error && <p className="pt-2 text-sm text-red-500">{error}</p>}
    </div>
  );
}
