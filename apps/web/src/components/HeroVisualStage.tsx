import React from 'react';
import { Check, Lock, ShieldCheck } from 'lucide-react';

interface HeroVisualStageProps {
  onTryDemo: () => void;
}

/**
 * Original Pure Path product preview showcasing Pure Scribe's two core differentiators:
 * 1. Inline 1-click completion for unanswered clinical fields
 * 2. Zero-retention RAM-only transcript purging upon EMR transfer
 */
export const HeroVisualStage: React.FC<HeroVisualStageProps> = ({ onTryDemo }) => {
  return (
    <div
      onClick={onTryDemo}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onTryDemo();
      }}
      className="rounded-[24px] p-5 sm:p-7 border border-[#dbeafe] cursor-pointer select-none group transition-shadow hover:shadow-[0_24px_60px_rgba(29,78,216,0.1)]"
      style={{
        background:
          'radial-gradient(95% 80% at 10% 0%, #eff6ff 0%, transparent 60%), radial-gradient(85% 80% at 95% 100%, #e0ecff 0%, transparent 62%), #f8fafc',
      }}
    >
      {/* Main Pure Scribe Document Frame */}
      <div className="rounded-[18px] bg-white border border-[#e5eaf2] shadow-[0_14px_40px_rgba(15,23,42,0.06)] overflow-hidden">
        {/* Top Clinic Bar */}
        <div className="px-5 py-3.5 border-b border-[#f1f5f9] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <span className="text-xs font-semibold text-[#0b162c] truncate">
              Follow-Up Note · Ready for EMR
            </span>
          </div>
          <span className="text-[11px] font-mono text-[#1d4ed8] font-semibold shrink-0">
            10/11 fields filled
          </span>
        </div>

        {/* Clean Structured Note Preview */}
        <div className="p-5 space-y-4 text-left">
          <div className="space-y-1">
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#94a3b8]">
              Subjective &amp; Assessment
            </div>
            <p className="text-xs leading-relaxed text-[#334155]">
              Chronic right L4–L5 lumbar radiculopathy follow-up. Current pain 6/10, positive right straight leg raise at 45°, motor 5/5 bilaterally. Plan: submit prior auth for repeat TFESI and continue PT.
            </p>
          </div>

          {/* Differentiator #1: Inline 1-Click Gap Completion */}
          <div className="rounded-xl bg-[#f8fafc] border border-[#e5eaf2] p-3.5 space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-[#0b162c]">
                Unanswered: PDMP / UDS &amp; Naloxone
              </span>
              <span className="font-medium text-[#1d4ed8]">1-click confirm</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#1d4ed8] text-white">
                <Check className="w-3 h-3" />
                PDMP Checked + UDS Ordered + Naloxone
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-white border border-[#dbeafe] text-[#1d4ed8]">
                + Recent UDS on File
              </span>
            </div>
          </div>
        </div>

        {/* Differentiator #2: Pure Path Dark Navy Zero-Retention Strip */}
        <div className="pp-security-card px-5 py-3.5 text-white flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs">
            <Lock className="w-3.5 h-3.5 text-blue-300 shrink-0" />
            <span className="font-medium text-slate-100">
              Fill &amp; Purge: raw transcript shreds on EMR push
            </span>
          </div>
          <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-emerald-300">
            <ShieldCheck className="w-3.5 h-3.5" />
            0 B Retained
          </span>
        </div>
      </div>
    </div>
  );
};
