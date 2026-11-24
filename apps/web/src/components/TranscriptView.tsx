import React from 'react';
import { Flame, Loader2, ShieldCheck } from 'lucide-react';
import type { PurgeReceipt } from '@medscribe/core';

interface TranscriptViewProps {
  transcript: string;
  byteLength: number;
  isExtracting: boolean;
  purgeReceipt: PurgeReceipt | null;
  onTranscriptChange: (val: string) => void;
  onExtract: () => void;
  onManualShred: () => void;
}

export const TranscriptView: React.FC<TranscriptViewProps> = ({
  transcript,
  byteLength,
  isExtracting,
  purgeReceipt,
  onTranscriptChange,
  onExtract,
  onManualShred,
}) => {
  return (
    <div className="max-w-3xl mx-auto px-6 sm:px-10 py-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 pb-4 border-b border-[#e5eaf2]">
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.02em] text-[#0b162c]">
            Transcript
          </h1>
          <p className="text-xs text-[#64748b] mt-1">
            {byteLength > 0
              ? `${byteLength.toLocaleString()} bytes in RAM · Cleared on DrChrono transfer.`
              : 'Empty RAM buffer.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {byteLength > 0 && (
            <button
              type="button"
              onClick={onManualShred}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold text-rose-700 bg-white border border-rose-200 hover:bg-rose-50 cursor-pointer"
            >
              <Flame className="w-3.5 h-3.5" />
              Shred Now
            </button>
          )}
          <button
            type="button"
            disabled={!transcript.trim() || isExtracting}
            onClick={onExtract}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold bg-[#0b162c] hover:bg-[#1d4ed8] disabled:bg-slate-200 disabled:text-slate-400 text-white transition-colors cursor-pointer"
          >
            {isExtracting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {isExtracting ? 'Generating…' : 'Generate Note'}
          </button>
        </div>
      </div>

      {purgeReceipt && !transcript ? (
        /* Signature PurePath Dark Navy Security Receipt Card */
        <div className="pp-security-card rounded-[22px] p-8 text-white space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/15 font-mono text-[10px] uppercase tracking-wider text-blue-200">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
            Zero-Retention Verified
          </div>
          <h2 className="font-serif-display text-2xl font-normal text-white">
            Raw encounter transcript permanently shredded.
          </h2>
          <p className="text-sm text-slate-300 max-w-lg leading-relaxed">
            {purgeReceipt.bytesZeroed.toLocaleString()} bytes were overwritten with zeros in volatile memory and dropped. Your structured pain management note remains available in the Note tab.
          </p>
          <div className="pt-2 flex flex-wrap gap-3 font-mono text-[11px] text-blue-200/90">
            <span>Receipt: {purgeReceipt.receiptId}</span>
            <span>·</span>
            <span>SHA-256: {purgeReceipt.verificationHash.slice(0, 16)}…</span>
          </div>
        </div>
      ) : (
        <textarea
          rows={18}
          value={transcript}
          onChange={(e) => onTranscriptChange(e.target.value)}
          placeholder="Paste or dictate the patient encounter transcript here, then click Generate Note…"
          className="w-full resize-y bg-[#f8fafc] border border-[#e5eaf2] focus:border-[#1d4ed8] focus:bg-white focus:outline-none rounded-xl p-5 text-[13.5px] leading-relaxed text-[#0b162c] placeholder:text-[#94a3b8] font-mono transition-colors"
        />
      )}
    </div>
  );
};
