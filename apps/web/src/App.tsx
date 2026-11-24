import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Cpu,
  Flame,
  Lock,
  Mic,
  MicOff,
  Send,
  ShieldCheck,
  Undo2,
} from 'lucide-react';
import {
  EphemeralTranscriptVault,
  SAMPLE_ENCOUNTERS,
  applySuggestionToNote,
  extractPainNote,
  finalizeNoteWithPurge,
  getUnansweredFields,
  listTemplates,
  updateFieldValue,
  updatePEGScores,
  type DrChronoSyncResult,
  type LLMConfig,
  type PainNote,
  type PurgeReceipt,
  type SampleEncounter,
  type TemplateId,
} from '@medscribe/core';
import { HeroVisualStage } from './components/HeroVisualStage';
import { DocumentNoteView } from './components/DocumentNoteView';
import { TranscriptView } from './components/TranscriptView';
import { DrChronoView } from './components/DrChronoView';
import { SettingsModal } from './components/SettingsModal';

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type DemoTab = 'note' | 'transcript' | 'drchrono';

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function App() {
  const vaultRef = useRef<EphemeralTranscriptVault>(new EphemeralTranscriptVault());
  const templates = useMemo(() => listTemplates(), []);

  const [templateId, setTemplateId] = useState<TemplateId>('pain_followup');
  const [activeTab, setActiveTab] = useState<DemoTab>('note');
  const [activeSampleId, setActiveSampleId] = useState<string>(SAMPLE_ENCOUNTERS[0].id);

  const [transcriptView, setTranscriptView] = useState('');
  const [byteLength, setByteLength] = useState(0);
  const [note, setNote] = useState<PainNote | null>(null);
  const [noteHistory, setNoteHistory] = useState<PainNote[]>([]);
  const [purgeReceipt, setPurgeReceipt] = useState<PurgeReceipt | null>(null);
  const [transferState, setTransferState] = useState<
    'none' | 'preview_only' | 'clipboard_copied' | 'api_saved'
  >('none');

  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [isExtracting, setIsExtracting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [llmConfig, setLlmConfig] = useState<LLMConfig>({ provider: 'demo' });
  const [showSettings, setShowSettings] = useState(false);

  // Contact form state
  const [contactName, setContactName] = useState('');
  const [contactClinic, setContactClinic] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactEmr, setContactEmr] = useState('DrChrono');
  const [contactSent, setContactSent] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptRef = useRef(transcriptView);
  const autoExtractRef = useRef(false);

  useEffect(() => {
    transcriptRef.current = transcriptView;
  }, [transcriptView]);

  // Pre-load the first realistic Pain Management encounter so the interactive demo is immediately alive
  useEffect(() => {
    void handleLoadSample(SAMPLE_ENCOUNTERS[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isRecording) {
      setRecordSeconds(0);
      return;
    }
    const id = window.setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [isRecording]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const handleTranscriptChange = (val: string) => {
    vaultRef.current.setTranscript(val);
    setTranscriptView(val);
    setByteLength(vaultRef.current.getByteLength());
    if (val.length > 0) setPurgeReceipt(null);
  };

  const runExtraction = async (rawText: string, tplId: TemplateId) => {
    if (!rawText.trim()) return;
    setIsExtracting(true);
    setTransferState('none');
    try {
      const extracted = await extractPainNote(rawText, tplId, llmConfig);
      setNote(extracted);
      setNoteHistory([]);
      setActiveTab('note');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleLoadSample = async (sample: SampleEncounter) => {
    setActiveSampleId(sample.id);
    setTemplateId(sample.templateId);
    handleTranscriptChange(sample.transcript);
    await runExtraction(sample.transcript, sample.templateId);
  };

  const toggleRecording = () => {
    if (isRecording) {
      autoExtractRef.current = true;
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }

    const Ctor =
      (window as unknown as Record<string, new () => SpeechRecognitionLike>).SpeechRecognition ||
      (window as unknown as Record<string, new () => SpeechRecognitionLike>).webkitSpeechRecognition;

    if (!Ctor) {
      setActiveTab('transcript');
      showToast('Mic unavailable in this browser — paste a transcript in the Transcript tab.');
      return;
    }

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let chunk = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) chunk += event.results[i][0].transcript + ' ';
      }
      if (chunk.trim()) {
        const next = transcriptRef.current
          ? `${transcriptRef.current.trim()}\n${chunk.trim()}`
          : chunk.trim();
        transcriptRef.current = next;
        handleTranscriptChange(next);
      }
    };

    recognition.onerror = () => {
      setIsRecording(false);
      autoExtractRef.current = false;
    };

    recognition.onend = () => {
      setIsRecording(false);
      if (autoExtractRef.current && transcriptRef.current.trim()) {
        autoExtractRef.current = false;
        void runExtraction(transcriptRef.current, templateId);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
    setActiveTab('transcript');
  };

  const handleAcceptSuggestion = (
    fieldKey: string,
    suggestionId: string,
    mode: 'replace' | 'append' = 'replace',
  ) => {
    if (!note) return;
    setNoteHistory((prev) => [...prev.slice(-14), note]);
    setNote(applySuggestionToNote(note, fieldKey, suggestionId, mode));
  };

  const handleUndo = () => {
    if (noteHistory.length === 0) return;
    const prev = noteHistory[noteHistory.length - 1];
    setNoteHistory((h) => h.slice(0, -1));
    setNote(prev);
  };

  const handleManualShred = async () => {
    const receipt = await vaultRef.current.purge('manual_shred');
    setTranscriptView('');
    setByteLength(0);
    setPurgeReceipt(receipt);
    if (note) setNote(finalizeNoteWithPurge(note, receipt));
    showToast(`Transcript shredded (${receipt.bytesZeroed.toLocaleString()} bytes zeroed).`);
  };

  const handleSyncComplete = async (result: DrChronoSyncResult, shouldPurge: boolean) => {
    let receipt = purgeReceipt;
    if (shouldPurge && vaultRef.current.hasData()) {
      receipt = await vaultRef.current.purge('drchrono_push');
      setTranscriptView('');
      setByteLength(0);
      setPurgeReceipt(receipt);
    }
    if (result.mode === 'api_saved' || result.mode === 'clipboard_copied' || result.mode === 'preview_only') {
      setTransferState(result.mode);
    }
    setNote((prev) => {
      if (!prev) return prev;
      const updated = shouldPurge && receipt ? finalizeNoteWithPurge(prev, receipt) : prev;
      return result.mode === 'api_saved' ? { ...updated, drChronoSyncedAt: result.syncedAt } : updated;
    });
    showToast(
      `${result.message}${shouldPurge && receipt ? ` Transcript cleared (${receipt.receiptId}).` : ''}`,
    );
  };

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactEmail.trim()) return;
    setContactSent(true);
  };

  const gapCount = note ? getUnansweredFields(note).length : 0;

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-white text-[#0b162c]">
      {/* PurePath Frosted White Sticky Header */}
      <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur-md border-b border-[#e5eaf2]">
        <div className="max-w-6xl mx-auto h-full px-5 sm:px-8 flex items-center justify-between gap-4">
          <a
            href="https://purepathwebsolutions.com"
            className="flex items-center gap-2.5 group"
          >
            <img
              src="./brand/pure-path-mark.png"
              alt="Pure Path logo"
              width={30}
              height={30}
              className="w-[30px] h-[30px] object-contain"
            />
            <span className="text-[21px] font-bold tracking-[-0.035em] text-[#0b162c]">
              pure path<span className="text-[#1d4ed8]">.</span>
            </span>
            <span className="hidden sm:inline text-xs font-mono text-[#94a3b8]">/ purescribe</span>
          </a>

          <nav aria-label="Primary" className="hidden md:flex items-center gap-7 text-[13.5px] font-medium text-[#4b5563]">
            <button type="button" onClick={() => scrollTo('demo')} className="hover:text-[#1d4ed8] cursor-pointer">
              Platform
            </button>
            <button type="button" onClick={() => scrollTo('evidence')} className="hover:text-[#1d4ed8] cursor-pointer">
              Research
            </button>
            <button type="button" onClick={() => scrollTo('pure-knowledge')} className="hover:text-[#1d4ed8] cursor-pointer">
              Pure Knowledge
            </button>
            <button type="button" onClick={() => scrollTo('faq')} className="hover:text-[#1d4ed8] cursor-pointer">
              FAQ
            </button>
          </nav>

          <button
            type="button"
            onClick={() => scrollTo('contact')}
            className="px-5 py-2.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-[#0b162c] hover:bg-[#1d4ed8] text-white transition-colors cursor-pointer"
          >
            Contact Us
          </button>
        </div>
      </header>

      <main>
      {/* SECTION 1: DeepScribe-Inspired Split Product Hero */}
      <section className="max-w-6xl mx-auto px-5 sm:px-8 pt-12 pb-16 lg:pt-20 lg:pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          <div className="lg:col-span-5 space-y-6">
            <h1 className="text-[40px] sm:text-[50px] font-normal tracking-[-0.03em] leading-[1.06] text-[#0b162c]">
              Clinical notes finished
              <span className="block text-[#2563eb]">before you leave the room.</span>
            </h1>

            <p className="text-[16px] leading-[1.6] text-[#4b5563] max-w-md">
              Pure Scribe turns patient visits into structured notes tailored to your EMR, lets doctors fill unanswered fields in one click, and shreds the raw transcript.
            </p>

            <div className="pt-1">
              <button
                type="button"
                onClick={() => scrollTo('contact')}
                className="px-7 py-3.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-[#0b162c] hover:bg-[#1d4ed8] text-white transition-colors cursor-pointer"
              >
                Request a Demo
              </button>
            </div>
          </div>

          <div className="lg:col-span-7">
            <HeroVisualStage onTryDemo={() => scrollTo('demo')} />
          </div>
        </div>
      </section>

      {/* SECTION 2: Interactive Live Platform Demo */}
      <section id="demo" className="bg-[#f8fafc] border-y border-[#e5eaf2] py-16 sm:py-20">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="font-mono text-[11px] uppercase tracking-widest text-[#1d4ed8] font-semibold">
                Interactive Demo
              </span>
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-[-0.025em] text-[#0b162c] mt-1">
                Try Pure Scribe on a live visit
              </h2>
            </div>

            {/* Quiet Sample Encounter Switcher */}
            <div className="flex flex-wrap items-center gap-1.5">
              {SAMPLE_ENCOUNTERS.map((s) => {
                const active = activeSampleId === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => void handleLoadSample(s)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#0b162c] border-[#0b162c] text-white'
                        : 'bg-white border-[#e5eaf2] text-[#4b5563] hover:border-[#1d4ed8] hover:text-[#1d4ed8]'
                    }`}
                  >
                    {templates.find((t) => t.id === s.templateId)?.shortName}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Crisp DeepScribe-style Elevated Product Frame */}
          <div className="rounded-[20px] bg-white border border-[#e5eaf2] shadow-[0_20px_60px_rgba(15,23,42,0.06)] overflow-hidden">
            {/* Calm Clinical App Top Bar */}
            <div className="px-5 py-3 border-b border-[#e5eaf2] bg-[#fafcff] flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-5">
                {(
                  [
                    { id: 'note', label: 'Note', badge: gapCount > 0 ? gapCount : null },
                    { id: 'transcript', label: 'Transcript', badge: null },
                    { id: 'drchrono', label: 'DrChrono', badge: null },
                  ] as const
                ).map((tab) => {
                  const active = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`inline-flex items-center gap-1.5 py-1 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                        active
                          ? 'border-[#1d4ed8] text-[#0b162c]'
                          : 'border-transparent text-[#64748b] hover:text-[#0b162c]'
                      }`}
                    >
                      {tab.label}
                      {tab.badge !== null && (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-[#eff6ff] text-[#1d4ed8]">
                          {tab.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={toggleRecording}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                    isRecording
                      ? 'bg-rose-600 text-white'
                      : 'bg-white border border-[#e5eaf2] text-[#0b162c] hover:border-[#1d4ed8]'
                  }`}
                >
                  {isRecording ? (
                    <>
                      <MicOff className="w-3.5 h-3.5 animate-pulse" />
                      Stop · {formatTimer(recordSeconds)}
                    </>
                  ) : (
                    <>
                      <Mic className="w-3.5 h-3.5 text-[#1d4ed8]" />
                      Record
                    </>
                  )}
                </button>

                {noteHistory.length > 0 && (
                  <button
                    type="button"
                    onClick={handleUndo}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium text-[#4b5563] hover:text-[#0b162c] cursor-pointer"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    Undo
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setShowSettings(true)}
                  title="Configure AI Engine (Local or BYOK)"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium text-[#64748b] hover:text-[#0b162c] cursor-pointer"
                >
                  <Cpu className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">
                    {llmConfig.provider === 'demo' ? 'Local' : llmConfig.provider.toUpperCase()}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('drchrono')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-[#0b162c] hover:bg-[#1d4ed8] text-white transition-colors cursor-pointer"
                >
                  <Send className="w-3 h-3" />
                  Send to DrChrono
                </button>
              </div>
            </div>

            {toast && (
              <div className="px-6 py-2.5 bg-[#eff6ff] border-b border-[#bfdbfe] text-xs text-[#1e3a8a] flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#1d4ed8] shrink-0" />
                <span>{toast}</span>
              </div>
            )}

            {/* Interactive Clinical Body */}
            <div className="max-h-[680px] overflow-y-auto bg-white">
              {activeTab === 'transcript' ? (
                <TranscriptView
                  transcript={transcriptView}
                  byteLength={byteLength}
                  isExtracting={isExtracting}
                  purgeReceipt={purgeReceipt}
                  onTranscriptChange={handleTranscriptChange}
                  onExtract={() => void runExtraction(vaultRef.current.readTranscript(), templateId)}
                  onManualShred={handleManualShred}
                />
              ) : activeTab === 'drchrono' && note ? (
                <DrChronoView
                  note={note}
                  hasTranscriptInRam={byteLength > 0}
                  onSyncComplete={handleSyncComplete}
                />
              ) : note ? (
                <DocumentNoteView
                  note={note}
                  transferState={transferState}
                  onFieldChange={(k, v) => setNote((prev) => (prev ? updateFieldValue(prev, k, v) : prev))}
                  onAcceptSuggestion={handleAcceptSuggestion}
                  onUpdatePEG={(p, e, g) => setNote((prev) => (prev ? updatePEGScores(prev, p, e, g) : prev))}
                  onToggleCode={(code) =>
                    setNote((prev) =>
                      prev
                        ? {
                            ...prev,
                            codes: prev.codes.map((c) =>
                              c.code === code ? { ...c, selected: !c.selected } : c,
                            ),
                          }
                        : prev,
                    )
                  }
                />
              ) : null}
            </div>

            {/* Quiet Ephemeral RAM Status Footer */}
            <div className="px-5 py-2.5 border-t border-[#e5eaf2] bg-[#fafcff] flex items-center justify-between text-[11px] text-[#64748b]">
              <span className="inline-flex items-center gap-1.5">
                {purgeReceipt && byteLength === 0 ? (
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Lock className="w-3.5 h-3.5 text-[#1d4ed8]" />
                )}
                {purgeReceipt && byteLength === 0
                  ? `Transcript shredded · Receipt ${purgeReceipt.receiptId}`
                  : `RAM-only transcript (${byteLength.toLocaleString()} bytes) · Shreds automatically on transfer`}
              </span>
              {byteLength > 0 && (
                <button
                  type="button"
                  onClick={handleManualShred}
                  className="inline-flex items-center gap-1 font-semibold text-rose-600 hover:underline cursor-pointer"
                >
                  <Flame className="w-3 h-3" />
                  Shred
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3: Three Points That Matter */}
      <section id="how-it-works" className="max-w-6xl mx-auto px-5 sm:px-8 py-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          <div className="space-y-2.5">
            <span className="font-mono text-xs text-[#1d4ed8] font-semibold">01</span>
            <h3 className="text-lg font-semibold tracking-[-0.015em] text-[#0b162c]">
              Built for specialty care
            </h3>
            <p className="text-sm leading-relaxed text-[#4b5563]">
              Adapts to follow-ups, consults, and procedures across pain management, orthopedics, cardiology, and primary care — with automatic ICD-10 &amp; CPT coding.
            </p>
          </div>

          <div className="space-y-2.5">
            <span className="font-mono text-xs text-[#1d4ed8] font-semibold">02</span>
            <h3 className="text-lg font-semibold tracking-[-0.015em] text-[#0b162c]">
              One-click gap completion
            </h3>
            <p className="text-sm leading-relaxed text-[#4b5563]">
              Never fabricates missed compliance checks. Unanswered fields like red flags, PDMP/UDS, or Naloxone appear inline with quick clinician confirmations.
            </p>
          </div>

          <div className="space-y-2.5">
            <span className="font-mono text-xs text-[#1d4ed8] font-semibold">03</span>
            <h3 className="text-lg font-semibold tracking-[-0.015em] text-[#0b162c]">
              Custom EMR integration, zero retention
            </h3>
            <p className="text-sm leading-relaxed text-[#4b5563]">
              We work with your clinic to integrate directly into your EMR (starting with DrChrono and major EHRs) and immediately shred raw transcripts after transfer.
            </p>
          </div>
        </div>
      </section>

      {/* SECTION 4: Peer-Reviewed Medical Literature & Clinical Research */}
      <section id="evidence" className="border-t border-[#e5eaf2] bg-[#f8fafc] py-20">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 space-y-10">
          <div className="max-w-2xl space-y-2">
            <span className="font-mono text-[11px] uppercase tracking-widest text-[#1d4ed8] font-semibold">
              Peer-Reviewed Literature
            </span>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-[-0.025em] text-[#0b162c]">
              Published research on ambient clinical AI
            </h2>
            <p className="text-sm text-[#4b5563] leading-relaxed">
              Independent, peer-reviewed studies evaluating how ambient AI documentation affects clinician workload, after-hours charting, and professional burnout.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <article className="rounded-[18px] bg-white border border-[#e5eaf2] p-6 flex flex-col justify-between gap-5">
              <div className="space-y-2.5">
                <div className="font-mono text-[10.5px] uppercase tracking-wider text-[#1d4ed8] font-semibold">
                  JAMA Network Open · 2025
                </div>
                <h3 className="text-[15px] font-semibold leading-snug text-[#0b162c]">
                  Use of Ambient AI Scribes to Reduce Administrative Burden and Professional Burnout
                </h3>
                <p className="text-xs leading-relaxed text-[#4b5563]">
                  Multi-center quality improvement study (263 ambulatory clinicians across 6 health systems) reporting lower self-reported burnout (51.9% to 38.8% at 30 days) and reduced note-related cognitive load.
                </p>
              </div>
              <a
                href="https://doi.org/10.1001/jamanetworkopen.2025.34976"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#1d4ed8] hover:underline"
              >
                Read source (DOI)
                <ArrowUpRight className="w-3.5 h-3.5" />
              </a>
            </article>

            <article className="rounded-[18px] bg-white border border-[#e5eaf2] p-6 flex flex-col justify-between gap-5">
              <div className="space-y-2.5">
                <div className="font-mono text-[10.5px] uppercase tracking-wider text-[#1d4ed8] font-semibold">
                  NEJM Catalyst · 2024–2025
                </div>
                <h3 className="text-[15px] font-semibold leading-snug text-[#0b162c]">
                  Ambient Artificial Intelligence Scribes to Alleviate the Burden of Clinical Documentation
                </h3>
                <p className="text-xs leading-relaxed text-[#4b5563]">
                  Large-scale real-world evaluation by The Permanente Medical Group across ambulatory encounters examining reductions in after-hours EHR documentation and clinician satisfaction.
                </p>
              </div>
              <a
                href="https://doi.org/10.1056/CAT.23.0404"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#1d4ed8] hover:underline"
              >
                Read source (DOI)
                <ArrowUpRight className="w-3.5 h-3.5" />
              </a>
            </article>

            <article className="rounded-[18px] bg-white border border-[#e5eaf2] p-6 flex flex-col justify-between gap-5">
              <div className="space-y-2.5">
                <div className="font-mono text-[10.5px] uppercase tracking-wider text-[#1d4ed8] font-semibold">
                  JAMIA · 2024–2025
                </div>
                <h3 className="text-[15px] font-semibold leading-snug text-[#0b162c]">
                  Physician Perspectives on Ambient AI Scribe Usability and Task Load
                </h3>
                <p className="text-xs leading-relaxed text-[#4b5563]">
                  Academic pilot evaluation assessing usability, perceived documentation efficiency, and clinician-reported task load during outpatient clinical workflows.
                </p>
              </div>
              <a
                href="https://doi.org/10.1093/jamia/ocae295"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#1d4ed8] hover:underline"
              >
                Read source (DOI)
                <ArrowUpRight className="w-3.5 h-3.5" />
              </a>
            </article>
          </div>

          <p className="text-[11.5px] text-[#64748b] leading-relaxed">
            Citations above refer to independent, third-party peer-reviewed studies on ambient clinical AI in general and do not constitute clinical trial results for Pure Scribe. Individual clinic results vary, and clinicians remain responsible for reviewing and signing all medical records.
          </p>
        </div>
      </section>

      {/* SECTION 5: Pure Knowledge Companion Banner (PurePath Dark Navy Card) */}
      <section id="pure-knowledge" className="max-w-6xl mx-auto px-5 sm:px-8 py-20">
        <div className="pp-security-card rounded-[24px] p-8 sm:p-12 text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
          <div className="space-y-3 max-w-xl">
            <span className="inline-block px-3 py-1 rounded-full bg-white/10 border border-white/15 font-mono text-[10px] uppercase tracking-widest text-blue-200">
              Pure Knowledge
            </span>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-[-0.02em] text-white">
              Pure Knowledge — AI brain for your business.
            </h2>
            <p className="text-sm sm:text-[15px] leading-relaxed text-slate-300">
              Connect your clinic SOPs, fee schedules, prior-authorization rules, and EHR workflows into one private, HIPAA-aligned AI brain alongside Pure Scribe.
            </p>
          </div>

          <a
            href="https://purepathwebsolutions.com/ai-brain"
            className="shrink-0 inline-flex items-center gap-2 px-6 py-3 rounded-full text-xs font-semibold uppercase tracking-wider bg-white text-[#0b162c] hover:bg-[#eff6ff] transition-colors"
          >
            Explore Pure Knowledge
            <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </section>

      {/* SECTION 6: AEO-Optimized FAQ (Direct Answers + Internal Links) */}
      <section id="faq" className="max-w-4xl mx-auto px-5 sm:px-8 pb-20 space-y-8">
        <div className="space-y-1.5">
          <span className="font-mono text-[11px] uppercase tracking-widest text-[#1d4ed8] font-semibold">
            Frequently Asked Questions
          </span>
          <h2 className="text-2xl font-semibold tracking-[-0.02em] text-[#0b162c]">
            Common questions about Pure Scribe
          </h2>
        </div>

        <div className="divide-y divide-[#e5eaf2] border-y border-[#e5eaf2]">
          <div className="py-5 space-y-1.5">
            <h3 className="text-sm font-semibold text-[#0b162c]">
              How does Pure Scribe integrate with clinic EMRs like DrChrono?
            </h3>
            <p className="text-sm leading-relaxed text-[#4b5563]">
              Pure Path works directly with your clinic to map custom templates and integrate Pure Scribe into your EMR—starting with DrChrono API and browser side-panel workflows as well as major outpatient EHR platforms.
            </p>
          </div>

          <div className="py-5 space-y-1.5">
            <h3 className="text-sm font-semibold text-[#0b162c]">
              What happens to the raw encounter transcript after the note is filled?
            </h3>
            <p className="text-sm leading-relaxed text-[#4b5563]">
              Raw transcripts stay strictly in volatile memory (RAM) while you review. As soon as the structured note transfers to your EMR, the transcript buffer is overwritten with zeros and discarded with a PHI-free verification receipt.
            </p>
          </div>

          <div className="py-5 space-y-1.5">
            <h3 className="text-sm font-semibold text-[#0b162c]">
              How does Pure Scribe prevent hallucinated chart details?
            </h3>
            <p className="text-sm leading-relaxed text-[#4b5563]">
              Unanswered clinical or compliance fields are never silently fabricated into completed sections. Instead, Pure Scribe highlights missing fields inline and offers context-aware options that the physician verifies and inserts in one click.
            </p>
          </div>

          <div className="py-5 space-y-1.5">
            <h3 className="text-sm font-semibold text-[#0b162c]">
              How does Pure Scribe connect with Pure Knowledge and Pure Path?
            </h3>
            <p className="text-sm leading-relaxed text-[#4b5563]">
              Pure Scribe handles clinical visit documentation, while{' '}
              <a
                href="https://purepathwebsolutions.com/ai-brain"
                className="font-medium text-[#1d4ed8] hover:underline"
              >
                Pure Knowledge (AI brain for your business)
              </a>{' '}
              answers internal operations, SOP, and billing questions—both built and supported by{' '}
              <a
                href="https://purepathwebsolutions.com"
                className="font-medium text-[#1d4ed8] hover:underline"
              >
                Pure Path
              </a>
              .
            </p>
          </div>
        </div>
      </section>

      {/* SECTION 5: Contact Us */}
      <section id="contact" className="border-t border-[#e5eaf2] bg-[#f8fafc] py-20">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 grid grid-cols-1 md:grid-cols-12 gap-10 items-start">
          <div className="md:col-span-5 space-y-3">
            <span className="font-mono text-[11px] uppercase tracking-widest text-[#1d4ed8] font-semibold">
              Contact Us
            </span>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-[-0.025em] text-[#0b162c]">
              Deploy Pure Scribe in your clinic.
            </h2>
            <p className="text-sm leading-relaxed text-[#4b5563]">
              We build out custom clinical templates, integrate directly with your EMR, and deploy HIPAA BAA-covered infrastructure alongside Pure Knowledge.
            </p>
          </div>

          <div className="md:col-span-7">
            {contactSent ? (
              <div className="rounded-[20px] bg-white border border-[#e5eaf2] p-8 space-y-2">
                <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                <h3 className="text-base font-semibold text-[#0b162c]">Request received.</h3>
                <p className="text-sm text-[#4b5563]">
                  We’ll reach out to <strong>{contactEmail}</strong> to schedule your Pure Scribe + DrChrono walkthrough.
                </p>
              </div>
            ) : (
              <form
                onSubmit={handleContactSubmit}
                className="rounded-[20px] bg-white border border-[#e5eaf2] p-6 sm:p-8 space-y-4"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[#4b5563] mb-1.5">Name</label>
                    <input
                      type="text"
                      required
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      placeholder="Dr. Jordan Patel"
                      className="w-full rounded-lg border border-[#e5eaf2] bg-[#f8fafc] focus:bg-white focus:border-[#1d4ed8] focus:outline-none px-3.5 py-2.5 text-sm text-[#0b162c]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#4b5563] mb-1.5">Clinic / Practice</label>
                    <input
                      type="text"
                      required
                      value={contactClinic}
                      onChange={(e) => setContactClinic(e.target.value)}
                      placeholder="Apex Spine & Pain"
                      className="w-full rounded-lg border border-[#e5eaf2] bg-[#f8fafc] focus:bg-white focus:border-[#1d4ed8] focus:outline-none px-3.5 py-2.5 text-sm text-[#0b162c]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[#4b5563] mb-1.5">Work Email</label>
                    <input
                      type="email"
                      required
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      placeholder="doctor@clinic.com"
                      className="w-full rounded-lg border border-[#e5eaf2] bg-[#f8fafc] focus:bg-white focus:border-[#1d4ed8] focus:outline-none px-3.5 py-2.5 text-sm text-[#0b162c]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#4b5563] mb-1.5">Current EMR</label>
                    <input
                      type="text"
                      value={contactEmr}
                      onChange={(e) => setContactEmr(e.target.value)}
                      className="w-full rounded-lg border border-[#e5eaf2] bg-[#f8fafc] focus:bg-white focus:border-[#1d4ed8] focus:outline-none px-3.5 py-2.5 text-sm text-[#0b162c]"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full sm:w-auto px-7 py-3 rounded-full text-xs font-semibold uppercase tracking-wider bg-[#0b162c] hover:bg-[#1d4ed8] text-white transition-colors cursor-pointer"
                >
                  Request Demo
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      </main>

      {/* PurePath Dark Navy Footer with Internal Backlinks & Legal Disclaimers */}
      <footer className="bg-[#0b162c] text-slate-400 py-10">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <a href="https://purepathwebsolutions.com" className="flex items-center gap-2.5">
              <img
                src="./brand/pure-path-mark.png"
                alt="Pure Path"
                width={24}
                height={24}
                className="w-6 h-6 object-contain brightness-0 invert"
              />
              <span className="text-white font-bold tracking-[-0.03em] text-base">
                pure path<span className="text-[#3b82f6]">.</span>
              </span>
            </a>

            <div className="flex flex-wrap items-center gap-6 text-xs">
              <a href="https://purepathwebsolutions.com" className="hover:text-white transition-colors">
                Home
              </a>
              <a href="https://purepathwebsolutions.com/purescribe" className="text-white font-medium">
                Pure Scribe
              </a>
              <a href="https://purepathwebsolutions.com/ai-brain" className="hover:text-white transition-colors">
                Pure Knowledge
              </a>
              <button type="button" onClick={() => scrollTo('contact')} className="hover:text-white transition-colors cursor-pointer">
                Contact
              </button>
            </div>
          </div>

          <p className="text-[11px] leading-relaxed text-slate-500 border-t border-slate-800 pt-5">
            Pure Scribe is a clinical documentation assistant and does not provide medical advice or replace independent clinical judgment. Physicians must review and verify all generated notes and codes prior to signing. HIPAA-aligned infrastructure and Business Associate Agreements (BAA) are established prior to production PHI onboarding. All third-party EHR names and trademarks, including DrChrono, are the property of their respective owners.
          </p>
        </div>
      </footer>

      {showSettings && (
        <SettingsModal
          config={llmConfig}
          onSave={setLlmConfig}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
export default App;
