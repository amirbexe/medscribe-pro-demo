import React, { useState } from 'react';
import { Check, Copy, Flame, Loader2, Send, ShieldCheck } from 'lucide-react';
import {
  buildDrChronoPayload,
  syncToDrChrono,
  type DrChronoSyncResult,
  type PainNote,
} from '@medscribe/core';

interface DrChronoViewProps {
  note: PainNote;
  hasTranscriptInRam: boolean;
  onSyncComplete: (result: DrChronoSyncResult, shouldPurge: boolean) => Promise<void>;
}

export const DrChronoView: React.FC<DrChronoViewProps> = ({
  note,
  hasTranscriptInRam,
  onSyncComplete,
}) => {
  const [format, setFormat] = useState<'narrative' | 'json'>('narrative');
  const [appointmentId, setAppointmentId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const payload = buildDrChronoPayload(note, {
    appointmentId: appointmentId ? Number(appointmentId) : undefined,
  });

  const handleCopy = async (purgeAfter: boolean) => {
    const text = format === 'narrative' ? payload.formatted_narrative : JSON.stringify(payload, null, 2);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);

    await onSyncComplete(
      {
        success: true,
        mode: 'clipboard_copied',
        syncedAt: new Date().toISOString(),
        fieldsPopulated: payload.clinical_note_field_values.length,
        fieldsSkipped: 0,
        message: 'Copied clinical note for DrChrono.',
        payload,
      },
      purgeAfter,
    );
  };

  const handleApiPush = async () => {
    setIsSyncing(true);
    setError(null);
    try {
      const result = await syncToDrChrono(note, {
        accessToken: accessToken.trim() || undefined,
        appointmentId: appointmentId ? Number(appointmentId) : undefined,
      });
      await onSyncComplete(result, result.mode === 'api_saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save to DrChrono API.');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-6 sm:px-10 py-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 pb-4 border-b border-[#e5eaf2]">
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.02em] text-[#0b162c]">
            Send to DrChrono
          </h1>
          <p className="text-xs text-[#64748b] mt-1">
            {payload.clinical_note_field_values.length} fields mapped · {payload.icd10_codes.length} ICD-10 · {payload.cpt_codes.length} CPT
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleCopy(false)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold bg-white border border-[#cbd5e1] text-[#0b162c] hover:border-[#1d4ed8] cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy Only'}
          </button>

          {accessToken.trim() ? (
            <button
              type="button"
              disabled={isSyncing}
              onClick={handleApiPush}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold bg-[#0b162c] hover:bg-[#1d4ed8] text-white transition-colors cursor-pointer"
            >
              {isSyncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Save to DrChrono &amp; Shred
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleCopy(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold bg-[#0b162c] hover:bg-[#1d4ed8] text-white transition-colors cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              {hasTranscriptInRam ? 'Copy & Shred Transcript' : 'Copy Note'}
              {hasTranscriptInRam && <Flame className="w-3.5 h-3.5 text-blue-300" />}
            </button>
          )}
        </div>
      </div>

      {/* Optional Live API Credentials */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-[#4b5563] mb-1.5">
            DrChrono Appointment ID (optional for live API)
          </label>
          <input
            type="text"
            value={appointmentId}
            onChange={(e) => setAppointmentId(e.target.value.replace(/\D/g, ''))}
            placeholder="e.g. 18492031"
            className="w-full bg-[#f8fafc] border border-[#e5eaf2] focus:border-[#1d4ed8] focus:bg-white focus:outline-none rounded-lg px-3 py-2 text-xs text-[#0b162c]"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[#4b5563] mb-1.5">
            OAuth Bearer Token (POST /api/clinical_note_field_values)
          </label>
          <input
            type="password"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            placeholder="Leave blank to copy or inject via Chrome Extension"
            className="w-full bg-[#f8fafc] border border-[#e5eaf2] focus:border-[#1d4ed8] focus:bg-white focus:outline-none rounded-lg px-3 py-2 text-xs text-[#0b162c]"
          />
        </div>
      </div>

      {error && (
        <div className="border-l-2 border-rose-500 bg-rose-50/70 pl-3.5 py-2.5 text-xs text-rose-800">
          {error}
        </div>
      )}

      {/* Format Switcher */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs">
          <button
            type="button"
            onClick={() => setFormat('narrative')}
            className={`cursor-pointer ${
              format === 'narrative'
                ? 'font-semibold text-[#0b162c] underline underline-offset-4 decoration-[#1d4ed8]'
                : 'text-[#64748b] hover:text-[#0b162c]'
            }`}
          >
            Clinical Narrative
          </button>
          <button
            type="button"
            onClick={() => setFormat('json')}
            className={`cursor-pointer ${
              format === 'json'
                ? 'font-semibold text-[#0b162c] underline underline-offset-4 decoration-[#1d4ed8]'
                : 'text-[#64748b] hover:text-[#0b162c]'
            }`}
          >
            API JSON Payload
          </button>
        </div>

        <span className="inline-flex items-center gap-1.5 text-xs text-[#64748b]">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          {hasTranscriptInRam ? 'Transcript stays in RAM until saved or shredded' : 'Transcript purged (0 B)'}
        </span>
      </div>

      <pre className="w-full rounded-xl bg-[#f8fafc] border border-[#e5eaf2] p-5 text-xs leading-relaxed text-[#0b162c] font-mono whitespace-pre-wrap overflow-x-auto">
        {format === 'narrative' ? payload.formatted_narrative : JSON.stringify(payload, null, 2)}
      </pre>
    </div>
  );
};
