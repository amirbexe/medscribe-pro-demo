# MedScribe Pain Pro — Pain Management AI Medical Scribe

> **Pain Management-specialized AI medical scribe with 1-click AI gap filling, CDC MME & PEG-3 clinical intelligence, DrChrono EMR integration, and Strict Fill-and-Purge zero transcript retention.**

MedScribe Pain Pro eliminates chart fatigue for interventional and chronic pain management physicians. Record or paste a patient encounter, let the AI populate structured pain management notes, resolve any unanswered clinical or compliance fields in seconds using context-aware 1-click AI suggestions, push to DrChrono, and **automatically shred the raw transcript from RAM**.

---

## Key Capabilities

### 1. Built Specifically for Pain Management (3 Templates)
- **Chronic Pain Follow-Up & Medication Management** — OPQRST, 4-point NRS pain severity, PEG-3 functional outcome tracking, cauda equina/neuro red flags, opioid & multimodal regimen review, PDMP/UDS/Naloxone compliance, focused spine/MSK/neuro exam, imaging, assessment, and multimodal plan.
- **New Patient Pain Management Consultation** — Comprehensive pain trajectory, payer prior-authorization-ready failed conservative treatments, psychosocial & Opioid Risk Tool (ORT) screening, full neuro-MSK exam, diagnostic review, and initial multimodal roadmap.
- **Interventional Pain Procedure Note** — Fluoroscopy/ultrasound-guided ESI, MBB, RFA, and SI/joint procedures with informed consent/universal time-out/ASRA anticoagulation verification, needle placement & contrast spread (negative vascular/intrathecal uptake), injectate composition, sedation/monitoring, EBL/complications, pre/post NRS relief %, and discharge plan.

### 2. AI Gap-Filler Copilot (Zero Typing for Unanswered Fields)
- Never hallucinates missing details into `Filled` fields.
- Flags every **Unanswered** or **Partial** clinical/compliance field (prioritizing compliance-critical items like Red Flags, PDMP/UDS/Naloxone, ASRA anticoagulation hold, and contrast uptake).
- Generates **2–3 conversation-aware clinical suggestions** per gap with a rationale and confidence score so clinicians can complete their entire note in a few clicks.

### 3. Real-Time Pain Clinical Calculators & Coding
- **CDC MME Calculator (`@medscribe/core`)**: Automatically calculates total daily Morphine Milligram Equivalents from the encounter, flags `>=50` and `>=90 MME/day` thresholds, detects concurrent benzodiazepine co-prescribing (FDA Boxed Warning), and flags Naloxone recommendations.
- **PEG-3 Functional Outcome Score**: Extracts and computes the Pain / Enjoyment / General Activity composite score (0–10).
- **Pain ICD-10 & CPT Code Suggestions**: Suggests relevant pain management codes (`M54.16`, `M51.16`, `M47.816`, `M54.12`, `G89.29`, `Z79.891`, `99214`, `99204`, `64483`, `62323`, `64493`, `64635`, `27096`).

### 4. Strict Fill-and-Purge (Zero Transcript Retention)
- `EphemeralTranscriptVault` keeps raw encounter transcripts strictly in a volatile RAM `Uint8Array` — **never** written to `localStorage`, `sessionStorage`, `IndexedDB`, or disk.
- Pushing to DrChrono or clicking **Shred** immediately overwrites the RAM buffer with random bytes + zeros, strips any raw `sourceQuote` snippets from the note, and issues a **PHI-free SHA-256 Purge Receipt**.

### 5. DrChrono EMR Integration (Web App + Chrome Extension)
- **Web App (`apps/web`)**: Formats structured `clinical_note_field_values`, ICD-10/CPT codes, and clinical narrative for DrChrono's Clinical Notes API (supports live OAuth Bearer Token push or Dry-Run/Clipboard export).
- **Chrome Extension (`apps/extension`)**: Manifest V3 Side Panel + DrChrono content script (`https://*.drchrono.com/*`) that discovers DrChrono clinical note inputs, injects every pain management field with visual confirmation highlights, and immediately purges the transcript upon success.

### 6. Pluggable AI Engine (Works Immediately With Zero API Keys)
- Runs out of the box with a built-in **Local Pain Management NLP & Gap-Suggestion Engine** (zero API keys required) plus 3 realistic sample pain encounters.
- Plug in your own **Anthropic Claude**, **OpenAI**, or **Google Gemini** API key at any time via **Engine Settings**.

---

## Monorepo Architecture

```text
medscribe-pro-demo/
├── packages/
│   └── core/                  # @medscribe/core — shared domain engine
│       ├── src/templates/     # 3 Pain Management clinical templates
│       ├── src/clinical/      # CDC MME calculator, PEG-3 scorer, ICD-10/CPT matcher
│       ├── src/ai/            # Pluggable Claude/OpenAI/Gemini + Zero-Key Demo Engine
│       ├── src/ephemeral/     # EphemeralTranscriptVault (RAM-only + SHA-256 PurgeReceipt)
│       ├── src/emr/           # DrChrono API adapter & DOM field selector map
│       ├── src/samples/       # 3 realistic pain management sample encounters
│       └── src/tests/         # Automated unit test suite
├── apps/
│   ├── web/                   # React + TypeScript + Tailwind standalone clinical workspace
│   └── extension/             # Manifest V3 Chrome Extension (Side Panel + DrChrono injector)
└── package.json               # npm workspaces root
```

---

## Quick Start

### Prerequisites
- Node.js 20+ and npm 10+

### Install & Run Web App
```bash
npm install
npm run build:core
npm run dev
```
Open `http://localhost:5173`, click any of the **Sample Pain Encounters** on the left, review the auto-calculated MME/PEG-3 and 1-click **AI Gap-Filler Copilot** suggestions on the right, and click **Push to DrChrono & Shred Transcript**.

### Run Unit Tests & Full Production Build
```bash
npm test
npm run build
```

### Load the DrChrono Chrome Extension
1. Run `npm run build` (builds `apps/extension/dist/`).
2. Open Chrome and go to `chrome://extensions/`.
3. Enable **Developer mode**, click **Load unpacked**, and select `apps/extension/dist`.
4. Open any `*.drchrono.com` clinical note page and click the **MedScribe Pain Pro** toolbar icon to open the Side Panel.

---

## Clinical & HIPAA Disclaimer
MedScribe Pain Pro is a clinical documentation assistant and does not replace independent medical judgment. Physicians must review and verify all extracted fields, AI suggestions, MME calculations, and billing codes prior to signing clinical notes. For production HIPAA deployments, route external LLM requests through a BAA-covered backend proxy.
