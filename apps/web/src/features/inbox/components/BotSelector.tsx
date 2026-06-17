'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { ConvDetail } from '../inbox.types';

interface BotSelectorProps {
  conversation: ConvDetail;
  bots: Array<{ id: string; botName: string; persona?: { name: string } | null }>;
  onSetBot?: (botId: string | null) => Promise<void>;
  loading?: boolean;
}

export function BotSelector({
  conversation,
  bots,
  onSetBot,
  loading = false,
}: BotSelectorProps) {
  const [showSuggest, setShowSuggest] = useState(false);
  const [suggesting, setSuggesting] = useState(false);

  const currentBot = conversation.bot;

  const handleSuggestBot = async () => {
    setSuggesting(true);
    try {
      // TODO: Call /conversations/{id}/suggest-bot endpoint
      await new Promise((r) => setTimeout(r, 1000));
      setShowSuggest(false);
    } finally {
      setSuggesting(false);
    }
  };

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

      {/* Suggest button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleSuggestBot}
        disabled={suggesting || loading}
        className="w-full text-xs"
      >
        {suggesting ? '⏳ Analyzing…' : '💡 Suggest persona (AI)'}
      </Button>
    </div>
  );
}
