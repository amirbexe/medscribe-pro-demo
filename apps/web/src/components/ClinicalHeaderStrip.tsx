import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { MMEResult, NoteCompletionStats, PEGScore } from '@medscribe/core';

interface ClinicalHeaderStripProps {
  mme: MMEResult;
  peg: PEGScore;
  stats: NoteCompletionStats;
  filterMode: 'all' | 'gaps';
  onFilterChange: (mode: 'all' | 'gaps') => void;
  onUpdatePEG: (p: number | null, e: number | null, g: number | null) => void;
}

const SCORES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export const ClinicalHeaderStrip: React.FC<ClinicalHeaderStripProps> = ({
  mme,
  peg,
  stats,
  filterMode,
  onFilterChange,
  onUpdatePEG,
}) => {
  const [pegOpen, setPegOpen] = useState(false);
  const gapCount = stats.missing + stats.partial;

  return (
    <div className="space-y-3">
      {/* Ultra-minimal single metadata bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 py-2.5 border-y border-[#e5eaf2] text-xs text-[#4b5563]">
        <div className="flex flex-wrap items-center gap-5">
          {mme.medicationStatus === 'opioid_active' && (
            <span>
              MME{' '}
              <strong className={mme.riskTier === 'high' ? 'text-rose-700' : 'text-[#0b162c]'}>
                {mme.totalDailyMME}/day
              </strong>
              {mme.concurrentBenzo && <span className="text-rose-600 font-medium"> · +Benzo</span>}
            </span>
          )}

          <button
            type="button"
            onClick={() => setPegOpen((o) => !o)}
            className="hover:text-[#1d4ed8] transition-colors cursor-pointer"
          >
            PEG-3{' '}
            <strong className="text-[#0b162c]">
              {peg.composite !== null ? `${peg.composite}/10` : 'Set'}
            </strong>
          </button>

          <span>
            <strong className="text-[#0b162c]">
              {stats.filled}/{stats.total}
            </strong>{' '}
            filled
          </span>
        </div>

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => onFilterChange('all')}
            className={`cursor-pointer ${
              filterMode === 'all' ? 'font-semibold text-[#0b162c]' : 'hover:text-[#0b162c]'
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => onFilterChange('gaps')}
            className={`cursor-pointer ${
              filterMode === 'gaps' ? 'font-semibold text-[#1d4ed8]' : 'hover:text-[#0b162c]'
            }`}
          >
            Missing ({gapCount})
          </button>
        </div>
      </div>

      {/* Minimal inline PEG-3 picker */}
      {pegOpen && (
        <div className="py-3 px-4 rounded-xl bg-[#f8fafc] border border-[#e5eaf2] space-y-2">
          {(
            [
              { label: 'Pain', val: peg.painAverage, idx: 0 },
              { label: 'Enjoyment', val: peg.enjoymentInterference, idx: 1 },
              { label: 'Activity', val: peg.generalActivityInterference, idx: 2 },
            ] as const
          ).map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-2">
              <span className="text-xs text-[#4b5563] w-20">{row.label}</span>
              <div className="flex items-center gap-1">
                {SCORES.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => {
                      const p = row.idx === 0 ? n : peg.painAverage;
                      const e = row.idx === 1 ? n : peg.enjoymentInterference;
                      const g = row.idx === 2 ? n : peg.generalActivityInterference;
                      onUpdatePEG(p, e, g);
                    }}
                    className={`w-6 h-6 rounded-md text-[11px] font-medium cursor-pointer ${
                      row.val === n
                        ? 'bg-[#0b162c] text-white'
                        : 'bg-white border border-[#e5eaf2] text-[#4b5563] hover:border-[#1d4ed8]'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Single quiet safety line when MME >= 50 or Benzo co-prescribed */}
      {mme.alerts.length > 0 && (
        <div className="flex items-start gap-2 border-l-2 border-rose-500 pl-3 py-1 text-xs text-rose-800">
          <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
          <span>{mme.alerts[0]}</span>
        </div>
      )}
    </div>
  );
};
