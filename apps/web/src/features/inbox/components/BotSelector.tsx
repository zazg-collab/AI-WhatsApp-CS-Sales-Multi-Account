'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Lightbulb, CircleNotch } from '@/components/ui/core-essential-icons';
import type { ConvDetail } from '../inbox.types';

interface BotSuggestion {
  botId: string;
  botName: string;
  personaName: string | null;
  reason: string;
}

interface BotSelectorProps {
  conversation: ConvDetail;
  bots: Array<{ id: string; botName: string; persona?: { name: string } | null }>;
  onSetBot?: (botId: string | null) => Promise<void>;
  onSuggestBot?: () => Promise<void>;
  /** Latest AI suggestion result (owned by the page). */
  suggestion?: BotSuggestion | null;
  loading?: boolean;
}

export function BotSelector({
  conversation,
  bots,
  onSetBot,
  onSuggestBot,
  suggestion,
  loading = false,
}: BotSelectorProps) {
  const [suggesting, setSuggesting] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const currentBot = conversation.bot;

  const handleSuggestBot = async () => {
    setSuggesting(true);
    setDismissed(false);
    try {
      await onSuggestBot?.();
    } finally {
      setSuggesting(false);
    }
  };

  // Only show a suggestion that points to a different bot than the current one.
  const showSuggestion =
    !!suggestion && !dismissed && suggestion.botId !== currentBot?.id;

  return (
    <div className="border-b border-gray-200 p-4 dark:border-gray-800">
      <h3 className="mb-3 text-xs font-semibold text-gray-900 dark:text-gray-100">
        Bot / Persona
      </h3>

      {/* Current bot */}
      <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 p-2.5 dark:border-gray-700 dark:bg-gray-800">
        <p className="text-xs text-gray-600 dark:text-gray-400">Active</p>
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {currentBot?.botName || 'Default (from account)'}
        </p>
        {currentBot?.persona && (
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Persona: {currentBot.persona.name}
          </p>
        )}
      </div>

      {/* Bot selector dropdown */}
      <div className="mb-3">
        <select
          value={currentBot?.id || ''}
          onChange={(e) => onSetBot?.(e.target.value || null)}
          disabled={loading}
          className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        >
          <option value="">Default (from account)</option>
          {bots.map((bot) => (
            <option key={bot.id} value={bot.id}>
              {bot.botName}
              {bot.persona ? ` (${bot.persona.name})` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* AI suggestion result */}
      {showSuggestion && suggestion && (
        <div className="mb-3 rounded-lg border border-sentinel-200 bg-sentinel-50 p-2.5 dark:border-sentinel-900/30 dark:bg-sentinel-900/20">
          <p className="flex items-center gap-1 text-xs font-medium text-sentinel-700 dark:text-sentinel-300">
            <Lightbulb className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Suggested: {suggestion.botName}
            {suggestion.personaName ? ` (${suggestion.personaName})` : ''}
          </p>
          <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">{suggestion.reason}</p>
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              className="flex-1 text-xs"
              disabled={loading}
              onClick={() => onSetBot?.(suggestion.botId)}
            >
              Apply
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 text-xs"
              onClick={() => setDismissed(true)}
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {/* Suggest button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleSuggestBot}
        disabled={suggesting || loading}
        className="flex w-full items-center justify-center gap-1 text-xs"
      >
        {suggesting ? (
          <><CircleNotch className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />Analyzing…</>
        ) : (
          <><Lightbulb className="h-3.5 w-3.5" aria-hidden="true" />Suggest persona (AI)</>
        )}
      </Button>
    </div>
  );
}
