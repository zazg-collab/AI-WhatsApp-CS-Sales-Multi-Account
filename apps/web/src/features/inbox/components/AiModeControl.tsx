'use client';

import type { ConvDetail } from '../inbox.types';

interface AiModeControlProps {
  conversation: ConvDetail;
  onSetMode?: (mode: string) => Promise<void>;
  loading?: boolean;
}

const aiModeLabel: Record<string, string> = {
  ai_on: 'AI ON',
  ai_off: 'AI OFF',
  ai_draft: 'AI Draft',
  ai_supervised: 'AI Supervised',
  ai_paused: 'AI Paused',
};

const aiModeDescription: Record<string, string> = {
  ai_on: 'Replies automatically',
  ai_off: 'Manual replies only',
  ai_draft: 'AI drafts, you approve',
  ai_supervised: 'Hermes reviews first',
  ai_paused: 'Paused due to risk',
};

export function AiModeControl({ conversation, onSetMode, loading = false }: AiModeControlProps) {
  const currentMode = conversation.aiMode;

  const modes = ['ai_on', 'ai_off', 'ai_draft', 'ai_supervised'] as const;

  return (
    <div className="border-b border-gray-200 p-4 dark:border-gray-800">
      <h3 className="mb-3 text-xs font-semibold text-gray-900 dark:text-gray-100">
        AI Mode
      </h3>

      <div className="space-y-2">
        {modes.map((mode) => (
          <label key={mode} className="flex items-start gap-2">
            <input
              type="radio"
              name="ai-mode"
              value={mode}
              checked={currentMode === mode}
              onChange={() => onSetMode?.(mode)}
              disabled={loading || currentMode === 'ai_paused'}
              className="mt-1"
            />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {aiModeLabel[mode]}
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {aiModeDescription[mode]}
              </p>
            </div>
          </label>
        ))}
      </div>

      {currentMode === 'ai_paused' && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 dark:border-red-900/30 dark:bg-red-900/20">
          <p className="text-xs font-medium text-red-700 dark:text-red-400">
            AI is paused due to a detected risk. Contact admin to resume.
          </p>
        </div>
      )}
    </div>
  );
}
