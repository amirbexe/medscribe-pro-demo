import React, { useState } from 'react';
import {
  getNoteCompletionStats,
  getTemplate,
  type FieldSection,
  type PainNote,
} from '@medscribe/core';
import { ClinicalHeaderStrip } from './ClinicalHeaderStrip';

interface DocumentNoteViewProps {
  note: PainNote;
  transferState: 'none' | 'preview_only' | 'clipboard_copied' | 'api_saved';
  onFieldChange: (fieldKey: string, value: string) => void;
  onAcceptSuggestion: (fieldKey: string, suggestionId: string, mode?: 'replace' | 'append') => void;
  onUpdatePEG: (p: number | null, e: number | null, g: number | null) => void;
  onToggleCode: (code: string) => void;
}

export const DocumentNoteView: React.FC<DocumentNoteViewProps> = ({
  note,
  transferState,
  onFieldChange,
  onAcceptSuggestion,
  onUpdatePEG,
  onToggleCode,
}) => {
  const [filterMode, setFilterMode] = useState<'all' | 'gaps'>('all');
  const template = getTemplate(note.templateId);
  const stats = getNoteCompletionStats(note);

  const visibleFields =
    filterMode === 'gaps'
      ? template.fields.filter((def) => note.fields[def.key]?.status !== 'filled')
      : template.fields;

  const sections = new Map<FieldSection, typeof template.fields>();
  for (const def of visibleFields) {
    const list = sections.get(def.section) ?? [];
    list.push(def);
    sections.set(def.section, list);
  }

  return (
    <div className="max-w-2xl mx-auto px-6 sm:px-8 py-8 space-y-6">
      {/* Clean app title — crisp sans-serif, zero marketing flair */}
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-[-0.02em] text-[#0b162c]">
          {template.name}
        </h1>
        {transferState !== 'none' && (
          <span className="text-xs font-medium text-emerald-700">
            {transferState === 'api_saved' ? 'Saved to DrChrono' : 'Copied for DrChrono'}
          </span>
        )}
      </div>

      <ClinicalHeaderStrip
        mme={note.mme}
        peg={note.peg}
        stats={stats}
        filterMode={filterMode}
        onFilterChange={setFilterMode}
        onUpdatePEG={onUpdatePEG}
      />

      {visibleFields.length === 0 ? (
        <div className="py-12 text-center space-y-2">
          <p className="font-serif-display text-xl text-[#0b162c]">Note complete.</p>
          <button
            type="button"
            onClick={() => setFilterMode('all')}
            className="text-xs font-medium text-[#1d4ed8] hover:underline cursor-pointer"
          >
            Show full note
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {Array.from(sections.entries()).map(([sectionName, fieldDefs]) => (
            <section key={sectionName} className="space-y-5">
              <h2 className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">
                {sectionName}
              </h2>

              <div className="space-y-5">
                {fieldDefs.map((def) => {
                  const fieldVal = note.fields[def.key];
                  const status = fieldVal?.status ?? 'missing';
                  const showSuggestions =
                    status !== 'filled' && (fieldVal?.suggestions?.length ?? 0) > 0;

                  return (
                    <div key={def.key} className="space-y-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <label
                          htmlFor={`doc-field-${def.key}`}
                          className="text-[13px] font-semibold text-[#0b162c]"
                        >
                          {def.label}
                        </label>
                        {status !== 'filled' && (
                          <span className="text-[11px] font-medium text-[#1d4ed8]">
                            {status === 'missing' ? 'Missing' : 'Incomplete'}
                          </span>
                        )}
                      </div>

                      <textarea
                        id={`doc-field-${def.key}`}
                        rows={Math.max(
                          def.multiline ? 2 : 1,
                          Math.min(6, Math.ceil(((fieldVal?.value?.length ?? 0) + 1) / 68)),
                        )}
                        value={fieldVal?.value ?? ''}
                        onChange={(e) => onFieldChange(def.key, e.target.value)}
                        placeholder="Add note or pick a suggestion below…"
                        className="w-full resize-none bg-transparent hover:bg-[#f8fafc] focus:bg-[#f8fafc] border border-transparent focus:border-[#dbeafe] focus:outline-none rounded-lg px-2.5 -mx-2.5 py-1.5 text-[14px] leading-[1.6] text-[#1e293b] placeholder:text-[#cbd5e1] transition-colors"
                      />

                      {/* Ultra-clean inline 1-click suggestion chips */}
                      {showSuggestions && (
                        <div className="pt-1 flex flex-wrap gap-1.5">
                          {fieldVal.suggestions.map((sug) => (
                            <button
                              key={sug.id}
                              type="button"
                              title={sug.value}
                              onClick={() => onAcceptSuggestion(def.key, sug.id, 'replace')}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[#eff6ff] hover:bg-[#1d4ed8] text-[#1d4ed8] hover:text-white border border-[#dbeafe] transition-colors cursor-pointer"
                            >
                              + {sug.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          {/* Minimal Billing Codes */}
          {note.codes.length > 0 && (
            <section className="pt-4 border-t border-[#e5eaf2] space-y-2.5">
              <div className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">
                Codes
              </div>
              <div className="flex flex-wrap gap-1.5">
                {note.codes.map((c) => (
                  <button
                    key={`${c.system}-${c.code}`}
                    type="button"
                    title={c.description}
                    onClick={() => onToggleCode(c.code)}
                    className={`px-2.5 py-1 rounded-full text-xs font-mono border transition-colors cursor-pointer ${
                      c.selected
                        ? 'bg-[#0b162c] border-[#0b162c] text-white'
                        : 'bg-white border-[#e5eaf2] text-[#4b5563] hover:border-[#1d4ed8]'
                    }`}
                  >
                    {c.code}
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
};
