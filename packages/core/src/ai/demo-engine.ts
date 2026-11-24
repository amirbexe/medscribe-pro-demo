import type {
  ClinicalFieldValue,
  FieldSuggestion,
  PainNote,
  TemplateId,
} from '../types.js';
import { getTemplate } from '../templates/index.js';
import { calculateMMEFromText } from '../clinical/mme.js';
import { extractPEGFromText } from '../clinical/peg.js';
import { suggestBillingCodes } from '../clinical/icd10-cpt.js';

const CONVERSATIONAL_GREETING =
  /^(?:good\s+(?:morning|afternoon|evening)|hello|hi|hey|welcome|how\s+are\s+you|okay,?\s*let'?s\s+check)[^.!?]*[.!?]?\s*/i;

const MEDICATION_SENTENCE =
  /\b(oxycodone|hydrocodone|norco|percocet|morphine|hydromorphone|methadone|tramadol|fentanyl|buprenorphine|suboxone|gabapentin|pregabalin|lyrica|duloxetine|meloxicam|ibuprofen|cyclobenzaprine|tizanidine|alprazolam|xanax|clonazepam|lorazepam|carisoprodol|soma|miralax)\b/i;

function cleanClinicalSentence(raw: string): string {
  return raw
    .replace(/^(doctor|dr\.?|clinician|provider|patient|pt\.?)\s*:\s*/i, '')
    .replace(CONVERSATIONAL_GREETING, '')
    .replace(/^(?:mr\.|mrs\.|ms\.|dr\.)\s+[a-z]+,?\s*(?:good\s+to\s+see\s+you\s+back\s+(?:for\s+your\s+)?)?/i, '')
    .replace(/\b(?:good\s+to\s+see\s+you(?:\s+back)?\s*(?:for\s+your\s+)?)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sentencesMatching(
  text: string,
  patterns: RegExp[],
  limit = 3,
  excludePattern?: RegExp,
): string[] {
  const raw = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map(cleanClinicalSentence)
    .filter((s) => s.length > 8 && !/^\s*(?:yes|no|okay|alright|sure|thanks|thank you)[.!?]?\s*$/i.test(s));

  const hits: string[] = [];
  for (const s of raw) {
    if (excludePattern && excludePattern.test(s)) continue;
    if (patterns.some((p) => p.test(s))) {
      hits.push(s);
      if (hits.length >= limit) break;
    }
  }
  return hits;
}

function detectAnatomicRegion(text: string): { region: string; laterality: string; dermatome: string } {
  const lower = text.toLowerCase();
  const laterality =
    /\bbilateral\b/.test(lower)
      ? 'bilateral'
      : /\bright\b/.test(lower)
        ? 'right'
        : /\bleft\b/.test(lower)
          ? 'left'
          : 'axial';

  if (/\b(cervical|neck|c5|c6|c7|spurling|arm)\b/.test(lower)) {
    const level = lower.match(/\bc[3-7](?:-?c?[4-8])?\b/)?.[0]?.toUpperCase() ?? 'C5-C6';
    return { region: 'cervical spine', laterality, dermatome: level };
  }
  if (/\b(sacroiliac|si\s*joint|sacroiliitis|faber)\b/.test(lower)) {
    return { region: 'sacroiliac joint', laterality, dermatome: 'SIJ' };
  }
  if (/\b(knee|hip|shoulder|joint)\b/.test(lower)) {
    const joint = lower.match(/\b(knee|hip|shoulder)\b/)?.[0] ?? 'joint';
    return { region: joint, laterality, dermatome: joint };
  }
  const level = lower.match(/\bl[1-5](?:-?[ls]?[1-5])?\b/)?.[0]?.toUpperCase() ?? 'L4-L5';
  return { region: 'lumbar spine', laterality, dermatome: level };
}

function buildSuggestionsForField(
  key: string,
  transcript: string,
  mmeTotal: number,
  concurrentBenzo: boolean,
  naloxoneRecommended: boolean,
): FieldSuggestion[] {
  const anat = detectAnatomicRegion(transcript);
  const hasOpioids = mmeTotal > 0;
  const hasRadiation = /\b(radiat|sciatica|leg|arm|buttock|calf|numb|tingl|shoot)/i.test(transcript);

  switch (key) {
    case 'red_flags':
      return [
        {
          id: `${key}_neg`,
          label: 'No Cauda Equina / Red Flags',
          value:
            'Patient denies bowel or bladder incontinence, urinary retention, saddle anesthesia, progressive lower/upper extremity motor weakness, gait instability, fever, chills, or unexplained weight loss.',
          rationale:
            'No red flag symptoms were raised during the encounter; standard pertinent negatives for spine/pain safety clearance.',
          confidence: 0.91,
          tag: 'recommended',
        },
        {
          id: `${key}_warn`,
          label: 'Negatives + ER Precautions',
          value:
            'Denies bowel/bladder dysfunction, saddle numbness, or acute motor loss. Strict cauda equina and myelopathy return precautions reviewed with patient.',
          rationale: 'Documents pertinent negatives plus medico-legal safety counseling.',
          confidence: 0.86,
          tag: 'compliance',
        },
        {
          id: `${key}_deferred`,
          label: 'Mild Sensory — No Motor Loss',
          value: `Intermittent ${anat.laterality} paresthesias in ${anat.dermatome} distribution; denies bowel/bladder changes, saddle anesthesia, or progressive weakness.`,
          rationale: 'Fits patients reporting radicular tingling without acute neurologic emergency.',
          confidence: 0.78,
          tag: 'inferred',
        },
      ];

    case 'pdmp_uds_compliance':
      return [
        {
          id: `${key}_full`,
          label: hasOpioids ? 'PDMP Checked + UDS Ordered + Naloxone' : 'Non-Opioid — PDMP Reviewed',
          value: hasOpioids
            ? `State PDMP queried today and consistent with prescribed regimen (${mmeTotal} MME/day). Point-of-care UDS collected today for routine compliance monitoring. No aberrant medication-taking behaviors noted. ${
                naloxoneRecommended
                  ? 'Rescue intranasal Naloxone (4 mg) prescribed/confirmed on hand with overdose education.'
                  : 'Rescue Naloxone education reviewed.'
              }${concurrentBenzo ? ' Concurrent benzodiazepine respiratory risk explicitly counseled.' : ''}`
            : 'State PDMP queried and negative for outside controlled substance prescriptions. Patient managed on non-opioid multimodal regimen; controlled substance agreement not required at this time.',
          rationale: hasOpioids
            ? `Patient is on ${mmeTotal} MME/day${concurrentBenzo ? ' with concurrent benzodiazepine' : ''}; covers CDC/state PDMP, UDS, and Naloxone compliance.`
            : 'No active opioid therapy detected in transcript; documents clean PDMP check.',
          confidence: 0.93,
          tag: 'recommended',
        },
        {
          id: `${key}_uds_recent`,
          label: 'PDMP Consistent, Recent UDS on File',
          value: `State PDMP reviewed today and consistent with active prescriptions. Most recent UDS on file was appropriate and consistent with prescribed therapy; next random UDS scheduled at subsequent visit. Controlled substance agreement remains active and in good standing.`,
          rationale: 'Use if UDS was already completed within the last 3-6 months and not collected today.',
          confidence: 0.84,
          tag: 'compliance',
        },
        {
          id: `${key}_naloxone_rx`,
          label: 'Add Naloxone + Taper Discussion',
          value: `PDMP queried and consistent. UDS sent for confirmatory LC-MS testing. Discussed CDC opioid safety thresholds, prescribed intranasal Naloxone 4 mg PRN, and reviewed gradual dose-optimization/multimodal goals.`,
          rationale: 'Strongest documentation when MME >= 50 or co-prescribed sedatives are present.',
          confidence: 0.82,
          tag: 'conservative',
        },
      ];

    case 'functional_peg':
      return [
        {
          id: `${key}_mod`,
          label: 'Moderate Impact (PEG ~5.3/10)',
          value:
            'Pain moderately interferes with daily walking tolerance (15-20 min), prolonged sitting/standing, and restorative sleep. Patient remains independent in basic ADLs. Estimated PEG-3: Pain 6/10, Enjoyment 5/10, General Activity 5/10 (Composite 5.3/10).',
          rationale: 'Consistent with moderate chronic pain limiting endurance while preserving ADL independence.',
          confidence: 0.84,
          tag: 'recommended',
        },
        {
          id: `${key}_improved`,
          label: 'Functional Improvement on Regimen',
          value:
            'Patient reports meaningful functional gains compared to baseline: improved sleep continuity, able to perform household chores and light walking, tolerating home exercise program. PEG-3 trending down (Composite ~4.0/10).',
          rationale: 'Documents objective functional benefit required to justify ongoing multimodal or opioid therapy.',
          confidence: 0.8,
          tag: 'inferred',
        },
        {
          id: `${key}_severe`,
          label: 'Significant Functional Limitation',
          value:
            'Pain severely restricts standing/ambulation (<10 min), disrupts sleep nightly, and limits work/recreational participation. PEG-3: Pain 7/10, Enjoyment 8/10, General Activity 7/10 (Composite 7.3/10). Supports interventional escalation.',
          rationale: 'Supports medical necessity for interventional procedures or specialist escalation.',
          confidence: 0.77,
          tag: 'conservative',
        },
      ];

    case 'pain_scores':
      return [
        {
          id: `${key}_mod`,
          label: 'Moderate Chronic (5/6/8/3)',
          value: 'NRS Pain Scores (0-10): Current 5/10, Average 6/10, Worst 8/10, Best 3/10.',
          rationale: 'Standard 4-point NRS pain severity panel when only general severity was discussed.',
          confidence: 0.82,
          tag: 'recommended',
        },
        {
          id: `${key}_severe`,
          label: 'Severe Flare (7/7/9/4)',
          value: 'NRS Pain Scores (0-10): Current 7/10, Average 7/10, Worst 9/10, Best 4/10.',
          rationale: 'Fits acute-on-chronic pain exacerbation discussed in visit.',
          confidence: 0.76,
          tag: 'inferred',
        },
      ];

    case 'physical_exam':
      return [
        {
          id: `${key}_spine`,
          label: `Focused ${anat.region} Exam`,
          value: `Vitals stable. Gait non-antalgic without assistive device. ${
            anat.region === 'cervical spine'
              ? `Cervical paraspinal tenderness and decreased extension/rotation; ${
                  hasRadiation ? `positive ${anat.laterality} Spurling maneuver` : 'negative Spurling maneuver'
                }; Hoffman negative. Upper extremity motor 5/5 C5-T1 bilaterally, sensation intact except mild ${anat.laterality} ${anat.dermatome} paresthesia, DTRs 2+ symmetric.`
              : `Lumbar paraspinal tenderness and mild spasm over ${anat.dermatome}; pain reproduced with lumbar extension/facet loading; ${
                  hasRadiation ? `positive ${anat.laterality} straight leg raise (SLR) at 45°` : 'negative bilateral SLR'
                }. Lower extremity motor 5/5 L2-S1 bilaterally, DTRs 2+ symmetric at patella/Achilles.`
          }`,
          rationale: `Tailored to ${anat.laterality} ${anat.region} (${anat.dermatome}) presentation in the transcript.`,
          confidence: 0.87,
          tag: 'recommended',
        },
        {
          id: `${key}_neuro_intact`,
          label: 'Neurologically Intact Baseline',
          value:
            'Alert, oriented, no acute distress. Full 5/5 myotomal strength bilaterally, intact light touch sensation, symmetric 2+ DTRs, normal gait and heel/toe walk. Tenderness localized to primary pain region without erythema or swelling.',
          rationale: 'Concise neuro-intact exam when no focal deficits were mentioned.',
          confidence: 0.81,
          tag: 'conservative',
        },
      ];

    case 'prior_treatments':
      return [
        {
          id: `${key}_pa_ready`,
          label: 'Prior-Auth Ready Conservative Failure',
          value:
            'Failed >6 weeks of structured physical therapy, home exercise program, activity modification, oral NSAIDs (meloxicam/ibuprofen), and neuropathic/muscle relaxant trial with inadequate sustained relief (<30%).',
          rationale: 'Captures payer-required conservative failure criteria for MRI or interventional prior authorization.',
          confidence: 0.88,
          tag: 'compliance',
        },
        {
          id: `${key}_partial_pt`,
          label: 'Partial Relief from Meds & PT',
          value:
            'Previously trialed OTC NSAIDs, topical diclofenac, and brief home stretching with temporary mild relief; has not yet undergone interventional spine injections or spine surgery.',
          rationale: 'Conservative baseline when extensive prior interventions were not described.',
          confidence: 0.8,
          tag: 'recommended',
        },
      ];

    case 'psychosocial_ort':
      return [
        {
          id: `${key}_low`,
          label: 'Low Opioid Risk (ORT 0-3)',
          value:
            'No personal or family history of substance use disorder. Denies tobacco, illicit drug use, or heavy alcohol use. Mood stable without active severe depression or suicidal ideation. Opioid Risk Tool (ORT) Score: Low Risk (0-3).',
          rationale: 'Standard baseline psychosocial & ORT clearance when no risk factors were disclosed.',
          confidence: 0.85,
          tag: 'recommended',
        },
        {
          id: `${key}_mod`,
          label: 'Moderate Risk — Mood/Sleep Factor',
          value:
            'Reports chronic pain-related insomnia and situational anxiety/low mood; denies illicit substance use or alcohol misuse. ORT Score: Moderate Risk (4-7). Emphasize non-opioid multimodal therapy and pain psychology support.',
          rationale: 'Appropriate when chronic pain sleep/mood burden is present.',
          confidence: 0.79,
          tag: 'compliance',
        },
      ];

    case 'consent_timeout_anticoag':
      return [
        {
          id: `${key}_verified`,
          label: 'Full Time-Out & ASRA Anticoag Clear',
          value:
            'Informed written consent obtained after reviewing risks (bleeding, infection, nerve injury, dural puncture, steroid side effects), benefits, and alternatives. Universal protocol time-out completed verifying patient identity, procedure, level, and laterality. Anticoagulation/antiplatelet status verified compliant with ASRA guidelines. Allergies (contrast/local/steroid) and NPO status confirmed.',
          rationale: 'Complete Joint Commission / ASRA compliance block for interventional pain procedures.',
          confidence: 0.94,
          tag: 'recommended',
        },
      ];

    case 'guidance_contrast':
      return [
        {
          id: `${key}_fluoro`,
          label: 'Fluoro Guided — Negative Vascular Uptake',
          value: `Performed under intermittent AP, oblique, and lateral C-arm fluoroscopic guidance. Final needle tip position confirmed in target zone; negative aspiration for blood and CSF. Non-ionic contrast (Omnipaque 240) injected under live fluoroscopy demonstrating appropriate target spread with negative intravascular and negative intrathecal uptake. Total fluoroscopy time <30 seconds.`,
          rationale: 'Standard interventional spine fluoroscopy safety documentation.',
          confidence: 0.92,
          tag: 'recommended',
        },
      ];

    case 'complications_ebl':
      return [
        {
          id: `${key}_none`,
          label: 'No Complications, EBL <1 mL',
          value:
            'None. Estimated blood loss minimal (<1 mL). Patient tolerated procedure well without vasovagal reaction, paresthesia, or hemodynamic instability. Intact post-procedure motor and sensory exam.',
          rationale: 'Standard uncomplicated interventional procedure outcome.',
          confidence: 0.95,
          tag: 'recommended',
        },
      ];

    case 'sedation_monitoring':
      return [
        {
          id: `${key}_local`,
          label: 'Local Anesthesia + Standard Monitors',
          value:
            'Local anesthesia only (1% lidocaine skin/subcutaneous infiltration). Continuous ASA standard monitoring (pulse oximetry, NIBP, 3-lead ECG) maintained throughout; vitals remained stable.',
          rationale: 'Default for awake fluoroscopy-guided pain procedures without IV sedation.',
          confidence: 0.9,
          tag: 'recommended',
        },
        {
          id: `${key}_mod_sed`,
          label: 'Moderate IV Sedation + Capnography',
          value:
            'Moderate IV sedation administered under continuous monitoring (ECG, NIBP, SpO2, end-tidal CO2 capnography) with supplemental O2 via nasal cannula. Patient remained responsive to verbal/tactile stimulation.',
          rationale: 'Use if IV midazolam/fentanyl sedation was utilized.',
          confidence: 0.8,
          tag: 'inferred',
        },
      ];

    case 'post_procedure_nrs':
      return [
        {
          id: `${key}_relief`,
          label: 'Immediate Relief (1-2/10, >80%)',
          value: 'Immediate post-procedure NRS pain score: 1/10 (>80% diagnostic pain relief from local anesthetic phase).',
          rationale: 'Captures immediate diagnostic phase relief required for MBB/TFESI payer validation.',
          confidence: 0.87,
          tag: 'recommended',
        },
        {
          id: `${key}_partial`,
          label: 'Moderate Immediate Relief (3/10)',
          value: 'Immediate post-procedure NRS pain score: 3/10 (~50% immediate relief); steroid anti-inflammatory effect expected over 3-7 days.',
          rationale: 'Appropriate when immediate relief is partial and steroid onset is pending.',
          confidence: 0.81,
          tag: 'conservative',
        },
      ];

    case 'discharge_followup':
      return [
        {
          id: `${key}_std`,
          label: 'Stable Discharge + Pain Diary + 2-Wk F/U',
          value:
            'Observed in recovery for 20 minutes; vitals stable, ambulating independently without new motor deficit. Discharged home in stable condition with responsible escort. Written post-procedure instructions, red flag precautions (fever, worsening weakness, severe headache, bowel/bladder changes), and 14-day pain diary provided. Follow up in clinic in 2 weeks.',
          rationale: 'Complete post-procedure discharge and follow-up documentation.',
          confidence: 0.93,
          tag: 'recommended',
        },
      ];

    default:
      return [
        {
          id: `${key}_ctx`,
          label: 'Insert Context-Matched Summary',
          value: `Reviewed and addressed ${anat.laterality} ${anat.region} (${anat.dermatome}) clinical considerations with patient; no acute contraindications identified.`,
          rationale: 'Context-matched clinical summary based on the encounter.',
          confidence: 0.78,
          tag: 'recommended',
        },
      ];
  }
}

export function runDemoPainExtraction(transcript: string, templateId: TemplateId): PainNote {
  const template = getTemplate(templateId);
  const now = new Date().toISOString();
  const mme = calculateMMEFromText(transcript);
  const peg = extractPEGFromText(transcript);
  const codes = suggestBillingCodes(transcript, templateId);
  const anat = detectAnatomicRegion(transcript);

  const fields: Record<string, ClinicalFieldValue> = {};

  for (const def of template.fields) {
    let extracted = '';
    let status: ClinicalFieldValue['status'] = 'missing';
    let confidence = 0;
    let sourceQuote: string | undefined;

    switch (def.key) {
      case 'chief_complaint': {
        const hits = sentencesMatching(
          transcript,
          [/\b(here for|presents|follow-?up|referred|back pain|neck pain|leg pain|radiculopathy|sciatica|joint pain|pain in my|shortness of breath|dyspnea|chest pain|hypertension|swollen)\b/i],
          2,
        );
        if (hits.length > 0) {
          extracted =
            templateId === 'general_soap'
              ? hits[0]
              : `${
                  templateId === 'pain_initial' ? 'New patient pain consultation' : 'Chronic pain follow-up'
                } for ${anat.laterality} ${anat.region} (${anat.dermatome}) pain. ${hits[0]}`;
          status = 'filled';
          confidence = 0.92;
          sourceQuote = hits[0].slice(0, 120);
        }
        break;
      }

      case 'hpi_opqrst': {
        const hits = sentencesMatching(
          transcript,
          [/\b(pain|radiat|shoot|burn|sharp|ache|aching|throbb|numb|tingl|worse|better|sitting|standing|walking|weeks|months|years|since|last visit|shortness of breath|dyspnea|edema|swollen|exertion)\b/i],
          4,
        );
        if (hits.length >= 2) {
          extracted = hits.join(' ');
          status = 'filled';
          confidence = 0.9;
          sourceQuote = hits[0].slice(0, 120);
        } else if (hits.length === 1) {
          extracted = hits[0];
          status = 'partial';
          confidence = 0.65;
          sourceQuote = hits[0].slice(0, 120);
        }
        break;
      }

      case 'pain_scores': {
        const hits = sentencesMatching(transcript, [/\b(\d|10)\s*(?:\/\s*10|out\s*of\s*10)\b/i], 2);
        if (hits.length > 0) {
          const scoreMatches = Array.from(transcript.matchAll(/(\d(?:\.\d+)?|10)\s*(?:\/\s*10|out\s*of\s*10)/gi)).map(
            (m) => m[1],
          );
          if (scoreMatches.length >= 2) {
            extracted = `Reported NRS scores: ${hits.join(' ')}`;
            status = 'filled';
            confidence = 0.91;
          } else {
            extracted = `Current/reported pain: ${scoreMatches[0]}/10 (average/worst/best not fully specified).`;
            status = 'partial';
            confidence = 0.68;
          }
          sourceQuote = hits[0].slice(0, 120);
        }
        break;
      }

      case 'functional_peg': {
        // Exclude pure medication sentences (e.g., "I take alprazolam for sleep") from Functional Status
        const hits = sentencesMatching(
          transcript,
          [/\b(sleep|walk|walking|sit|sitting|stand|standing|work|enjoyment|activity|activities|chores|adl|exercise|grocery|stairs)\b/i],
          3,
          MEDICATION_SENTENCE,
        );
        if (peg.composite !== null && peg.painAverage !== null && peg.enjoymentInterference !== null && peg.generalActivityInterference !== null) {
          extracted = `PEG-3 Composite: ${peg.composite}/10 (Pain ${peg.painAverage}/10, Enjoyment ${peg.enjoymentInterference}/10, General Activity ${peg.generalActivityInterference}/10). ${hits.join(' ')}`;
          status = 'filled';
          confidence = 0.93;
          sourceQuote = hits[0]?.slice(0, 120);
        } else if (hits.length > 0) {
          extracted = `${hits.join(' ')} (Formal PEG-3 numerical subscores incomplete).`;
          status = 'partial';
          confidence = 0.66;
          sourceQuote = hits[0].slice(0, 120);
        }
        break;
      }

      case 'red_flags': {
        const hits = sentencesMatching(
          transcript,
          [/\b(bowel|bladder|incontinence|saddle|cauda|weakness|foot\s*drop|fever|weight\s*loss|myelopathy|drop\s*things)\b/i],
          2,
        );
        if (hits.length > 0) {
          extracted = hits.join(' ');
          status = 'filled';
          confidence = 0.89;
          sourceQuote = hits[0].slice(0, 120);
        }
        break;
      }

      case 'medications_mme': {
        const hits = sentencesMatching(
          transcript,
          [/\b(oxycodone|hydrocodone|norco|percocet|morphine|tramadol|gabapentin|pregabalin|lyrica|duloxetine|cymbalta|meloxicam|ibuprofen|celebrex|tizanidine|cyclobenzaprine|baclofen|lidocaine|naloxone|eliquis|apixaban|warfarin|plavix|clopidogrel|aspirin|xanax|alprazolam|clonazepam|lisinopril|furosemide|metformin|atorvastatin|metoprolol|amlodipine|allergic|allergies)\b/i],
          4,
        );
        if (hits.length > 0) {
          const mmeNote =
            mme.totalDailyMME > 0
              ? ` [Calculated Total Daily MME: ${mme.totalDailyMME} MME/day — ${mme.riskTier.toUpperCase()} risk]`
              : '';
          const missingAllergies = templateId === 'general_soap' && !/\b(allerg|nkda)\b/i.test(transcript);
          extracted = `${hits.join(' ')}${mmeNote}${missingAllergies ? ' (Drug allergies not yet stated).' : ''}`;
          status = missingAllergies ? 'partial' : 'filled';
          confidence = missingAllergies ? 0.72 : 0.92;
          sourceQuote = hits[0].slice(0, 120);
        }
        break;
      }

      case 'pdmp_uds_compliance': {
        const hits = sentencesMatching(
          transcript,
          [/\b(pdmp|pmp|urine\s*drug|uds|tox\s*screen|opioid\s*agreement|contract|naloxone|narcan|pill\s*count)\b/i],
          3,
        );
        const hasPdmp = /\b(pdmp|pmp)\b/i.test(transcript);
        const hasUds = /\b(urine\s*drug|uds|tox\s*screen)\b/i.test(transcript);
        const hasNaloxone = /\b(naloxone|narcan)\b/i.test(transcript);
        if (hits.length > 0 && hasPdmp && hasUds && (!mme.naloxoneRecommended || hasNaloxone)) {
          extracted = hits.join(' ');
          status = 'filled';
          confidence = 0.92;
          sourceQuote = hits[0].slice(0, 120);
        } else if (hits.length > 0) {
          extracted = `${hits.join(' ')} (Missing ${[
            !hasPdmp ? 'PDMP check' : null,
            !hasUds ? 'UDS status' : null,
            mme.naloxoneRecommended && !hasNaloxone ? 'Naloxone status' : null,
          ]
            .filter(Boolean)
            .join(', ')}).`;
          status = 'partial';
          confidence = 0.64;
          sourceQuote = hits[0].slice(0, 120);
        }
        break;
      }

      case 'prior_treatments': {
        const hits = sentencesMatching(
          transcript,
          [/\b(physical\s*therapy|pt\b|chiropract|injections?|epidural|esi|mbb|rfa|surgery|discectomy|fusion|tried|failed|nsaid|steroid\s*pack)\b/i],
          3,
        );
        if (hits.length > 0) {
          extracted = hits.join(' ');
          status = hits.length >= 2 ? 'filled' : 'partial';
          confidence = hits.length >= 2 ? 0.88 : 0.68;
          sourceQuote = hits[0].slice(0, 120);
        }
        break;
      }

      case 'psychosocial_ort': {
        const hits = sentencesMatching(
          transcript,
          [/\b(smoke|smoking|tobacco|alcohol|drink|substance|addiction|depression|anxiety|ort|opioid\s*risk|family\s*history)\b/i],
          3,
        );
        if (hits.length >= 2) {
          extracted = hits.join(' ');
          status = 'filled';
          confidence = 0.86;
          sourceQuote = hits[0].slice(0, 120);
        } else if (hits.length === 1) {
          extracted = `${hits[0]} (Formal ORT risk stratification not stated).`;
          status = 'partial';
          confidence = 0.6;
          sourceQuote = hits[0].slice(0, 120);
        }
        break;
      }

      case 'physical_exam': {
        const hits = sentencesMatching(
          transcript,
          [/\b(exam|bp\b|blood\s*pressure|heart\s*rate|oxygen|spo2|lungs|crackles|edema|gait|straight\s*leg|slr\b|spurling|faber|facet\s*loading|tenderness|strength|5\/5|reflex|dtr|sensation|range\s*of\s*motion|rom\b|hoffman)\b/i],
          4,
        );
        if (hits.length >= 2) {
          extracted = hits.join(' ');
          status = 'filled';
          confidence = 0.9;
          sourceQuote = hits[0].slice(0, 120);
        } else if (hits.length === 1) {
          extracted = hits[0];
          status = 'partial';
          confidence = 0.66;
          sourceQuote = hits[0].slice(0, 120);
        }
        break;
      }

      case 'diagnostics_imaging': {
        const hits = sentencesMatching(
          transcript,
          [/\b(mri|x-?ray|ct\s*scan|emg|nerve\s*conduction|herniation|protrusion|stenosis|spondylosis|bulge|prior\s*injection|last\s*epidural)\b/i],
          3,
        );
        if (hits.length > 0) {
          extracted = hits.join(' ');
          status = 'filled';
          confidence = 0.9;
          sourceQuote = hits[0].slice(0, 120);
        }
        break;
      }

      case 'assessment': {
        const hits = sentencesMatching(
          transcript,
          [/\b(assessment|impression|diagnosis|radiculopathy|facet\s*arthropathy|stenosis|disc\s*herniation|sacroiliitis|chronic\s*pain|hypertension|chf|heart\s*failure|diabetes)\b/i],
          3,
        );
        if (hits.length > 0) {
          extracted = hits.join(' ');
          status = 'filled';
          confidence = 0.88;
          sourceQuote = hits[0].slice(0, 120);
        }
        break;
      }

      case 'plan': {
        const hits = sentencesMatching(
          transcript,
          [/\b(plan|we'll|we\s*will|start|increase|continue|taper|refill|order|schedule|refer|physical\s*therapy|injection|epidural|mbb|rfa|follow\s*up|see\s*you\s*in)\b/i],
          4,
        );
        if (hits.length > 0) {
          extracted = hits.join(' ');
          status = 'filled';
          confidence = 0.91;
          sourceQuote = hits[0].slice(0, 120);
        }
        break;
      }

      // Procedure-specific fields
      case 'procedure_performed': {
        const hits = sentencesMatching(
          transcript,
          [/\b(transforaminal|interlaminar|epidural|tfesi|medial\s*branch|mbb|radiofrequency|rfa|sacroiliac|si\s*joint\s*injection|facet\s*injection)\b/i],
          2,
        );
        if (hits.length > 0) {
          extracted = hits.join(' ');
          status = 'filled';
          confidence = 0.94;
          sourceQuote = hits[0].slice(0, 120);
        }
        break;
      }

      case 'pre_post_dx': {
        const hits = sentencesMatching(
          transcript,
          [/\b(diagnosis|radiculopathy|herniation|stenosis|spondylosis|facet|sacroiliitis)\b/i],
          2,
        );
        if (hits.length > 0) {
          extracted = `Pre- and Post-Procedure Diagnosis: ${hits[0]}`;
          status = 'filled';
          confidence = 0.89;
          sourceQuote = hits[0].slice(0, 120);
        }
        break;
      }

      case 'consent_timeout_anticoag': {
        const hits = sentencesMatching(
          transcript,
          [/\b(consent|time-?out|eliquis|apixaban|warfarin|plavix|anticoag|held|npo|allerg)\b/i],
          3,
        );
        const hasConsent = /\bconsent\b/i.test(transcript);
        const hasTimeout = /\btime-?out\b/i.test(transcript);
        if (hits.length > 0 && hasConsent && hasTimeout) {
          extracted = hits.join(' ');
          status = 'filled';
          confidence = 0.91;
          sourceQuote = hits[0].slice(0, 120);
        } else if (hits.length > 0) {
          extracted = `${hits.join(' ')} (Universal time-out / full ASRA anticoagulation verification incomplete).`;
          status = 'partial';
          confidence = 0.63;
          sourceQuote = hits[0].slice(0, 120);
        }
        break;
      }

      case 'pre_procedure_nrs': {
        const hits = sentencesMatching(transcript, [/\b(pre-?procedure|before|baseline|today|right now).*?(\d|10)\s*(?:\/\s*10|out\s*of\s*10)/i], 1);
        if (hits.length > 0) {
          extracted = hits[0];
          status = 'filled';
          confidence = 0.92;
          sourceQuote = hits[0].slice(0, 120);
        }
        break;
      }

      case 'guidance_contrast': {
        const hits = sentencesMatching(
          transcript,
          [/\b(fluoro|fluoroscop|c-?arm|oblique|lateral|needle|gauge|contrast|omnipaque|epidurogram|vascular|intrathecal|aspiration)\b/i],
          3,
        );
        if (hits.length >= 2) {
          extracted = hits.join(' ');
          status = 'filled';
          confidence = 0.92;
          sourceQuote = hits[0].slice(0, 120);
        } else if (hits.length === 1) {
          extracted = `${hits[0]} (Contrast spread & negative vascular/intrathecal uptake not fully stated).`;
          status = 'partial';
          confidence = 0.65;
          sourceQuote = hits[0].slice(0, 120);
        }
        break;
      }

      case 'injectate_meds': {
        const hits = sentencesMatching(
          transcript,
          [/\b(dexamethasone|kenalog|triamcinolone|depomedrol|betamethasone|bupivacaine|lidocaine|ropivacaine|omnipaque|ml\b|mg\b)\b/i],
          3,
        );
        if (hits.length > 0) {
          extracted = hits.join(' ');
          status = 'filled';
          confidence = 0.93;
          sourceQuote = hits[0].slice(0, 120);
        }
        break;
      }

      case 'sedation_monitoring': {
        const hits = sentencesMatching(
          transcript,
          [/\b(local\s*anesthesia|sedation|versed|midazolam|monitor|pulse\s*ox|ecg|ekg|vitals)\b/i],
          2,
        );
        if (hits.length > 0) {
          extracted = hits.join(' ');
          status = 'filled';
          confidence = 0.88;
          sourceQuote = hits[0].slice(0, 120);
        }
        break;
      }

      case 'complications_ebl': {
        const hits = sentencesMatching(transcript, [/\b(complication|blood\s*loss|ebl|tolerated\s*well|bleeding)\b/i], 2);
        if (hits.length > 0) {
          extracted = hits.join(' ');
          status = 'filled';
          confidence = 0.9;
          sourceQuote = hits[0].slice(0, 120);
        }
        break;
      }

      case 'post_procedure_nrs': {
        const hits = sentencesMatching(
          transcript,
          [/\b(post-?procedure|after|now|recovery|relief).*?(\d|10)\s*(?:\/\s*10|out\s*of\s*10|%)/i],
          2,
        );
        if (hits.length > 0) {
          extracted = hits.join(' ');
          status = 'filled';
          confidence = 0.91;
          sourceQuote = hits[0].slice(0, 120);
        }
        break;
      }

      case 'discharge_followup': {
        const hits = sentencesMatching(
          transcript,
          [/\b(discharge|recovery|escort|driver|pain\s*diary|follow-?up|2\s*weeks|two\s*weeks|instructions)\b/i],
          2,
        );
        if (hits.length > 0) {
          extracted = hits.join(' ');
          status = 'filled';
          confidence = 0.89;
          sourceQuote = hits[0].slice(0, 120);
        }
        break;
      }
    }

    const rawSuggestions =
      status === 'filled'
        ? []
        : buildSuggestionsForField(
            def.key,
            transcript,
            mme.totalDailyMME,
            mme.concurrentBenzo,
            mme.naloxoneRecommended,
          );

    // Every suggestion for a missing or compliance-critical field explicitly requires clinician confirmation
    const suggestions = rawSuggestions.map((s) => ({
      ...s,
      requiresClinicianConfirmation:
        s.requiresClinicianConfirmation ?? (def.complianceCritical === true || status === 'missing'),
    }));

    fields[def.key] = {
      key: def.key,
      value: extracted,
      status,
      provenance: status === 'filled' ? 'transcript' : 'unverified',
      confidence,
      sourceQuote,
      suggestions,
    };
  }

  return {
    id: `note_${Date.now().toString(36)}`,
    templateId,
    createdAt: now,
    updatedAt: now,
    fields,
    mme,
    peg,
    codes,
    transcriptPurged: false,
  };
}
