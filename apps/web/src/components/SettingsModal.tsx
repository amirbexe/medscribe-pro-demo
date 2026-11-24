import React, { useEffect, useState } from 'react';
import { Cpu, KeyRound, Shield, X } from 'lucide-react';
import type { LLMConfig, LLMProviderType } from '@medscribe/core';

interface SettingsModalProps {
  config: LLMConfig;
  onSave: (next: LLMConfig) => void;
  onClose: () => void;
}

const PROVIDERS: Array<{ id: LLMProviderType; name: string; desc: string; defaultModel: string }> = [
  {
    id: 'demo',
    name: 'Built-in Pain Management Engine (Zero-Key)',
    desc: 'Runs 100% locally in your browser with deterministic Pain NLP, CDC MME/PEG-3 calculators, and smart gap suggestions.',
    defaultModel: 'local-pain-engine-v2',
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude (BYOK)',
    desc: 'Direct API extraction with Claude (BAA-eligible for production HIPAA workflows).',
    defaultModel: 'claude-3-5-sonnet-latest',
  },
  {
    id: 'openai',
    name: 'OpenAI (BYOK)',
    desc: 'Structured JSON mode extraction with GPT-4o / GPT-4o-mini.',
    defaultModel: 'gpt-4o-mini',
  },
  {
    id: 'gemini',
    name: 'Google Gemini (BYOK)',
    desc: 'Fast structured clinical extraction via Gemini 2.5 Flash.',
    defaultModel: 'gemini-2.5-flash',
  },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({ config, onSave, onClose }) => {
  const [provider, setProvider] = useState<LLMProviderType>(config.provider);
  const [apiKey, setApiKey] = useState(config.apiKey ?? '');
  const [model, setModel] = useState(config.model ?? '');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const selectedMeta = PROVIDERS.find((p) => p.id === provider)!;

  const handleSave = () => {
    onSave({
      provider,
      apiKey: provider === 'demo' ? undefined : apiKey.trim(),
      model: provider === 'demo' ? undefined : model.trim() || selectedMeta.defaultModel,
    });
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b162c]/55 backdrop-blur-xs p-4"
    >
      <div className="w-full max-w-lg rounded-[22px] border border-[#e5eaf2] bg-white shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#e5eaf2] flex items-center justify-between">
          <h2 id="settings-modal-title" className="font-serif-display text-xl text-[#0b162c] flex items-center gap-2">
            <Cpu className="w-4 h-4 text-[#1d4ed8]" />
            AI Extraction <em className="italic text-[#1d4ed8]">Engine</em>
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-2 rounded-full text-[#64748b] hover:text-[#0b162c] hover:bg-[#f1f5f9] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="space-y-2">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setProvider(p.id);
                  setModel(p.defaultModel);
                }}
                className={`w-full text-left rounded-[14px] border p-3.5 transition-all cursor-pointer ${
                  provider === p.id
                    ? 'border-[#1d4ed8] bg-[#eff6ff]'
                    : 'border-[#e5eaf2] bg-[#f8fafc] hover:border-[#bfdbfe]'
                }`}
              >
                <div className="text-xs font-semibold text-[#0b162c]">{p.name}</div>
                <div className="text-[11px] text-[#4b5563] mt-0.5">{p.desc}</div>
              </button>
            ))}
          </div>

          {provider !== 'demo' && (
            <div className="space-y-3 pt-3 border-t border-[#e5eaf2]">
              <div>
                <label className="block text-xs font-semibold text-[#0b162c] mb-1 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-[#1d4ed8]" />
                  API Key (held strictly in RAM)
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={`Enter your ${provider} API key`}
                  className="w-full bg-[#f8fafc] border border-[#cbd5e1] focus:border-[#1d4ed8] focus:bg-white focus:outline-none rounded-[10px] px-3 py-2 text-xs text-[#0b162c]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#0b162c] mb-1">Model ID</label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={selectedMeta.defaultModel}
                  className="w-full bg-[#f8fafc] border border-[#cbd5e1] focus:border-[#1d4ed8] focus:bg-white focus:outline-none rounded-[10px] px-3 py-2 text-xs text-[#0b162c] font-mono"
                />
              </div>
            </div>
          )}

          <div className="rounded-[14px] bg-[#f8fafc] border border-[#e5eaf2] p-3 flex items-start gap-2.5 text-[11px] text-[#4b5563]">
            <Shield className="w-4 h-4 text-[#1d4ed8] shrink-0 mt-0.5" />
            <span>
              API keys and encounter transcripts are never written to localStorage or cookies. Route production clinic traffic through a HIPAA BAA-covered proxy.
            </span>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-[#e5eaf2] bg-[#f8fafc] flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-full text-xs font-semibold text-[#4b5563] hover:bg-[#e2e8f0] cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 rounded-full text-xs font-semibold bg-[#0b162c] hover:bg-[#1d4ed8] text-white cursor-pointer"
          >
            Save Engine
          </button>
        </div>
      </div>
    </div>
  );
};
