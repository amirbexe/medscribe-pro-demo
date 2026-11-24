import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Flame,
  Mic,
  MicOff,
  Send,
  ShieldCheck,
  Sparkles,
  Undo2,
  Wand2,
} from 'lucide-react';
import {
  DRCHRONO_DOM_SELECTOR_MAP,
  EphemeralTranscriptVault,
  SAMPLE_ENCOUNTERS,
  applySuggestionToNote,
  buildDrChronoPayload,
  extractPainNote,
  finalizeNoteWithPurge,
  getNoteCompletionStats,
  getUnansweredFields,
  listTemplates,
  type PainNote,
  type PurgeReceipt,
  type TemplateId,
} from '@medscribe/core';

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

export const SidePanelApp: React.FC = () => {
  const vaultRef = useRef(new EphemeralTranscriptVault());
  const templates = listTemplates();

  const [templateId, setTemplateId] = useState<TemplateId>('pain_followup');
  const [transcript, setTranscript] = useState('');
  const [note, setNote] = useState<PainNote | null>(null);
  const [history, setHistory] = useState<PainNote[]>([]);
  const [receipt, setReceipt] = useState<PurgeReceipt | null>(null);
  const [drChronoStatus, setDrChronoStatus] = useState<'checking' | 'connected' | 'not_drchrono'>('checking');
  const [statusMsg, setStatusMsg] = useState<{ tone: 'info' | 'error' | 'success'; text: string } | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.tabs) {
      setDrChronoStatus('not_drchrono');
      return;
    }
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab?.id || !tab.url?.includes('drchrono.com')) {
        setDrChronoStatus('not_drchrono');
        return;
      }
      chrome.tabs.sendMessage(tab.id, { type: 'MEDSCRIBE_PING_DRCHRONO' }, (res) => {
        if (chrome.runtime.lastError || !res?.connected) {
          setDrChronoStatus('not_drchrono');
        } else {
          setDrChronoStatus('connected');
        }
      });
    });
  }, []);

  const updateTranscript = (val: string) => {
    vaultRef.current.setTranscript(val);
    setTranscript(val);
    if (val) setReceipt(null);
  };

  const toggleMic = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }
    const Ctor =
      (window as unknown as Record<string, new () => SpeechRecognitionLike>).SpeechRecognition ||
      (window as unknown as Record<string, new () => SpeechRecognitionLike>).webkitSpeechRecognition;
    if (!Ctor) {
      setStatusMsg({ tone: 'error', text: 'Web Speech API unavailable in this tab. Paste transcript or load a sample.' });
      return;
    }
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = 'en-US';
    rec.onresult = (event) => {
      let chunk = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) chunk += event.results[i][0].transcript + ' ';
      }
      if (chunk.trim()) {
        const next = vaultRef.current.readTranscript()
          ? `${vaultRef.current.readTranscript()}\n${chunk.trim()}`
          : chunk.trim();
        updateTranscript(next);
      }
    };
    rec.onerror = () => setIsRecording(false);
    rec.onend = () => setIsRecording(false);
    recognitionRef.current = rec;
    rec.start();
    setIsRecording(true);
  };

  const handleExtract = async (textOverride?: string, tplOverride?: TemplateId) => {
    const raw = textOverride ?? vaultRef.current.readTranscript();
    if (!raw.trim()) return;
    const extracted = await extractPainNote(raw, tplOverride ?? templateId, { provider: 'demo' });
    setNote(extracted);
    setHistory([]);
    setStatusMsg(null);
  };

  const handleAcceptSuggestion = (fieldKey: string, suggestionId: string) => {
    if (!note) return;
    setHistory((prev) => [...prev.slice(-10), note]);
    setNote(applySuggestionToNote(note, fieldKey, suggestionId, 'replace'));
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setNote(prev);
  };

  const handlePushToDrChronoAndShred = async () => {
    if (!note) return;
    const payload = buildDrChronoPayload(note);

    if (typeof chrome !== 'undefined' && chrome.tabs && drChronoStatus === 'connected') {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabId = tabs[0]?.id;
      if (tabId) {
        const res = await new Promise<{
          ok?: boolean;
          filledCount?: number;
          skippedCount?: number;
          failedCount?: number;
        }>((resolve) => {
          chrome.tabs.sendMessage(
            tabId,
            { type: 'MEDSCRIBE_INJECT_DRCHRONO', payload, selectorMap: DRCHRONO_DOM_SELECTOR_MAP },
            (r) => resolve(r ?? {}),
          );
        });

        // Never purge if DOM injection failed to populate any field!
        if (!res.ok || !res.filledCount) {
          setStatusMsg({
            tone: 'error',
            text: 'No matching DrChrono fields were populated — transcript preserved in RAM so you can retry or copy.',
          });
          return;
        }

        const purgeReceipt = await vaultRef.current.purge('drchrono_push');
        setTranscript('');
        setReceipt(purgeReceipt);
        setNote(finalizeNoteWithPurge(note, purgeReceipt));
        setStatusMsg({
          tone: 'success',
          text: `Inserted ${res.filledCount} fields into DrChrono (remember to Save in DrChrono). Transcript purged (${purgeReceipt.receiptId}).`,
        });
        return;
      }
    }

    if (navigator.clipboard) {
      await navigator.clipboard.writeText(payload.formatted_narrative);
    }
    const purgeReceipt = await vaultRef.current.purge('drchrono_push');
    setTranscript('');
    setReceipt(purgeReceipt);
    setNote(finalizeNoteWithPurge(note, purgeReceipt));
    setStatusMsg({
      tone: 'success',
      text: `Copied formatted note to clipboard & shredded transcript (${purgeReceipt.receiptId}).`,
    });
  };

  const gaps = note ? getUnansweredFields(note) : [];
  const stats = note ? getNoteCompletionStats(note) : null;

  return (
    <div className="min-h-screen flex flex-col bg-[#f8fafc] text-[#0b162c] p-3 space-y-3">
      {/* PurePath Branded Header */}
      <header className="flex items-center justify-between gap-2 pb-2.5 border-b border-[#e5eaf2]">
        <div className="flex items-baseline gap-2">
          <span className="text-[19px] font-bold tracking-[-0.035em] text-[#0b162c]">
            medscribe<span className="text-[#1d4ed8]">.</span>
          </span>
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#64748b]">DrChrono</span>
        </div>
        <span
          className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
            drChronoStatus === 'connected'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-[#eff6ff] text-[#1d4ed8] border-[#bfdbfe]'
          }`}
        >
          {drChronoStatus === 'connected' ? 'DrChrono Linked' : 'Standalone'}
        </span>
      </header>

      {/* Template Pills */}
      <div className="grid grid-cols-3 gap-1 bg-[#f1f5f9] p-1 rounded-full border border-[#e5eaf2]">
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTemplateId(t.id)}
            className={`py-1 px-1.5 rounded-full text-[10px] font-semibold cursor-pointer transition-all ${
              templateId === t.id ? 'bg-[#0b162c] text-white' : 'text-[#4b5563]'
            }`}
          >
            {t.shortName}
          </button>
        ))}
      </div>

      {/* Ephemeral Transcript Input */}
      <div className="space-y-2 bg-white rounded-[16px] border border-[#e5eaf2] p-3 shadow-xs">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-wider font-semibold text-[#1d4ed8]">
            RAM-Only Transcript
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleMic}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold cursor-pointer ${
                isRecording ? 'bg-rose-600 text-white' : 'bg-[#eff6ff] text-[#1d4ed8]'
              }`}
            >
              {isRecording ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
              {isRecording ? 'Stop' : 'Mic'}
            </button>
            <button
              type="button"
              onClick={() => {
                const sample = SAMPLE_ENCOUNTERS.find((s) => s.templateId === templateId) ?? SAMPLE_ENCOUNTERS[0];
                updateTranscript(sample.transcript);
                void handleExtract(sample.transcript, sample.templateId);
              }}
              className="text-[10px] font-semibold text-[#1d4ed8] hover:underline cursor-pointer"
            >
              Demo Visit
            </button>
          </div>
        </div>

        {receipt && !transcript ? (
          <div className="rounded-[12px] pp-security-card p-3.5 text-center text-white">
            <ShieldCheck className="w-5 h-5 text-emerald-300 mx-auto mb-1" />
            <div className="text-xs font-semibold">Transcript Purged (0 Bytes)</div>
            <div className="text-[10px] text-blue-200 font-mono mt-0.5">{receipt.receiptId}</div>
          </div>
        ) : (
          <textarea
            rows={4}
            value={transcript}
            onChange={(e) => updateTranscript(e.target.value)}
            placeholder="Dictate or paste encounter transcript…"
            className="w-full rounded-[10px] bg-[#f8fafc] border border-[#e5eaf2] p-2.5 text-[11px] font-mono text-[#0b162c] focus:border-[#1d4ed8] focus:bg-white focus:outline-none"
          />
        )}

        <button
          type="button"
          disabled={!transcript.trim()}
          onClick={() => void handleExtract()}
          className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-full text-xs font-semibold bg-[#1d4ed8] hover:bg-[#2563eb] disabled:bg-slate-200 disabled:text-slate-400 text-white cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Extract Note &amp; Find Gaps
        </button>
      </div>

      {/* Clinical Metrics + MME Safety Alerts */}
      {note && stats && (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-1.5 text-center">
            <div className="rounded-[12px] border border-[#e5eaf2] bg-white p-2">
              <div className="font-mono text-[9px] uppercase text-[#64748b]">MME/day</div>
              <div className="text-sm font-bold text-[#0b162c]">
                {note.mme.medicationStatus === 'unknown' ? '—' : note.mme.totalDailyMME}
              </div>
            </div>
            <div className="rounded-[12px] border border-[#e5eaf2] bg-white p-2">
              <div className="font-mono text-[9px] uppercase text-[#64748b]">PEG-3</div>
              <div className="text-sm font-bold text-[#1d4ed8]">{note.peg.composite ?? '—'}</div>
            </div>
            <div className="rounded-[12px] border border-[#e5eaf2] bg-white p-2">
              <div className="font-mono text-[9px] uppercase text-[#64748b]">Ready</div>
              <div className="text-sm font-bold text-emerald-700">{stats.percentComplete}%</div>
            </div>
          </div>

          {note.mme.alerts.length > 0 && (
            <div className="rounded-[12px] border border-rose-200 bg-rose-50 px-2.5 py-2 space-y-1">
              {note.mme.alerts.map((a, i) => (
                <div key={i} className="flex items-start gap-1.5 text-[11px] text-rose-800">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                  <span>{a}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Unanswered Gaps with 1-Click Confirmations */}
      {note && gaps.length > 0 && (
        <div className="space-y-2 flex-1 overflow-y-auto">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-[#0b162c] flex items-center gap-1.5">
              <Wand2 className="w-3.5 h-3.5 text-[#1d4ed8]" />
              {gaps.length} Unanswered — Verify &amp; Insert
            </span>
            {history.length > 0 && (
              <button
                type="button"
                onClick={handleUndo}
                className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#1d4ed8] hover:underline cursor-pointer"
              >
                <Undo2 className="w-3 h-3" />
                Undo
              </button>
            )}
          </div>

          {gaps.map(({ definition, field }) => (
            <div key={definition.key} className="rounded-[14px] border border-[#e5eaf2] bg-white p-2.5 space-y-1.5">
              <div className="text-[11px] font-semibold text-[#0b162c]">{definition.label}</div>
              {field.suggestions.slice(0, 2).map((sug) => (
                <button
                  key={sug.id}
                  type="button"
                  onClick={() => handleAcceptSuggestion(definition.key, sug.id)}
                  className="w-full text-left rounded-[10px] border border-[#bfdbfe] bg-[#eff6ff]/60 hover:bg-[#dbeafe] p-2 transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between text-[11px] font-semibold text-[#1d4ed8]">
                    <span>{sug.label}</span>
                    <Check className="w-3 h-3" />
                  </div>
                  <p className="text-[10px] text-[#0b162c] line-clamp-2 mt-0.5">{sug.value}</p>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {statusMsg && (
        <div
          className={`rounded-[12px] border px-3 py-2 text-[11px] ${
            statusMsg.tone === 'error'
              ? 'border-rose-200 bg-rose-50 text-rose-800'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}
        >
          {statusMsg.text}
        </div>
      )}

      {/* Sticky Push & Shred CTA */}
      {note && (
        <button
          type="button"
          onClick={() => void handlePushToDrChronoAndShred()}
          className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-full text-xs font-semibold bg-[#0b162c] hover:bg-[#1d4ed8] text-white transition-colors cursor-pointer"
        >
          <Send className="w-3.5 h-3.5" />
          {drChronoStatus === 'connected' ? 'Insert into DrChrono & Shred' : 'Copy Note & Shred'}
          <Flame className="w-3.5 h-3.5 text-blue-300" />
        </button>
      )}
    </div>
  );
};
