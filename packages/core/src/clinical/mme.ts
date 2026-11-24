import type { MMEResult, OpioidMedication } from '../types.js';

/**
 * CDC Clinical Practice Guideline for Prescribing Opioids (2022) MME conversion factors.
 * - Methadone uses tiered daily-dose conversion (1-20mg: 4x, 21-40mg: 8x, 41-60mg: 10x, >=61mg: 12x).
 * - Fentanyl transdermal patch uses mcg/hr * 2.4.
 * - Buprenorphine is a partial agonist with no standard CDC MME conversion factor.
 */
interface OpioidRule {
  canonical: string;
  drugPattern: string;
  factor: number;
  unit?: 'mg' | 'mcg_hr' | 'methadone';
}

const OPIOID_RULES: OpioidRule[] = [
  { canonical: 'Oxycodone', drugPattern: '(?:oxycodone|percocet|roxicodone|oxycontin)', factor: 1.5 },
  { canonical: 'Hydrocodone', drugPattern: '(?:hydrocodone|norco|vicodin|lortab)', factor: 1.0 },
  { canonical: 'Morphine', drugPattern: '(?:morphine|ms\\s*contin|kadian)', factor: 1.0 },
  { canonical: 'Hydromorphone', drugPattern: '(?:hydromorphone|dilaudid)', factor: 5.0 },
  { canonical: 'Oxymorphone', drugPattern: '(?:oxymorphone|opana)', factor: 3.0 },
  { canonical: 'Tramadol', drugPattern: '(?:tramadol|ultram)', factor: 0.2 },
  { canonical: 'Tapentadol', drugPattern: '(?:tapentadol|nucynta)', factor: 0.4 },
  { canonical: 'Codeine', drugPattern: '(?:codeine|tylenol\\s*#?3)', factor: 0.15 },
  { canonical: 'Methadone', drugPattern: '(?:methadone|dolophine)', factor: 4.0, unit: 'methadone' },
  { canonical: 'Fentanyl Patch', drugPattern: '(?:fentanyl|duragesic)', factor: 2.4, unit: 'mcg_hr' },
];

const BENZO_PATTERN =
  /\b(alprazolam|xanax|lorazepam|ativan|clonazepam|klonopin|diazepam|valium|temazepam|restoril|benzodiazepine|benzo)\b/i;

const CARISOPRODOL_PATTERN = /\b(carisoprodol|soma)\b/i;
const BUPRENORPHINE_PATTERN = /\b(buprenorphine|suboxone|subutex|belbuca|butrans)\b/i;

function methadoneFactor(totalDailyMg: number): number {
  if (totalDailyMg >= 61) return 12;
  if (totalDailyMg >= 41) return 10;
  if (totalDailyMg >= 21) return 8;
  return 4;
}

function parseTabletsPerDose(snippet: string): number {
  const range = snippet.match(/\b(\d+)\s*(?:to|-)\s*(\d+)\s*(?:tabs?|tablets?|pills?|capsules?)\b/i);
  if (range) return Math.min(4, Math.max(1, parseInt(range[2], 10)));
  const single = snippet.match(/\b(\d+)\s*(?:tabs?|tablets?|pills?|capsules?)\s*(?:every|q\d+h|tid|bid|qid|prn)/i);
  if (single) return Math.min(4, Math.max(1, parseInt(single[1], 10)));
  return 1;
}

function parseFrequencyPerDay(snippet: string): number {
  const s = snippet.toLowerCase();
  if (/\b(q4h|every\s*4\s*hours?|6\s*times?\s*(a|per)\s*day|six\s*times)\b/.test(s)) return 6;
  if (/\b(q6h|every\s*6\s*hours?|qid|4\s*times?\s*(a|per)\s*day|four\s*times)\b/.test(s)) return 4;
  if (/\b(q8h|every\s*8\s*hours?|tid|3\s*times?\s*(a|per)\s*day|three\s*times)\b/.test(s)) return 3;
  if (/\b(q12h|every\s*12\s*hours?|bid|twice\s*(a|per)?\s*day|2\s*times?\s*(a|per)\s*day|two\s*times)\b/.test(s)) return 2;
  if (/\b(qd|daily|once\s*(a|per)?\s*day|qhs|at\s*bedtime|every\s*72\s*hours?|q72h)\b/.test(s)) return 1;
  const maxTabs = s.match(/(?:up\s*to|takes?|taking)\s*(\d+)\s*(?:tabs?|tablets?|pills?|capsules?|doses?)\s*(?:a|per)?\s*day/);
  if (maxTabs) return Math.min(8, Math.max(1, parseInt(maxTabs[1], 10)));
  return 1;
}

function detectFormulation(clause: string, drugPattern: string): 'ER' | 'IR' {
  const erRe = new RegExp(`\\b(?:oxycontin|ms\\s*contin|kadian|duragesic|${drugPattern}\\s*(?:er|xr|sr|cr|extended))\\b`, 'i');
  return erRe.test(clause) ? 'ER' : 'IR';
}

export function calculateMMEFromText(text: string): MMEResult {
  // Keyed by `${canonical}-${formulation}` so ER + IR sum accurately, while plan dose updates replace rather than double-count
  const medMap = new Map<string, OpioidMedication>();
  const clauses = text.split(/[?!;\n]+|(?<!\d)\.|\.(?!\d)/).filter((s) => s.trim().length > 0);

  for (const clause of clauses) {
    if (/\b(denies|no\s+longer\s+taking|stopped|discontinued|never\s+taken|allerg(?:y|ic)\s+to)\b/i.test(clause)) {
      continue;
    }

    for (const rule of OPIOID_RULES) {
      if (rule.unit === 'mcg_hr') {
        const re = new RegExp(
          `\\b${rule.drugPattern}\\s*(?:patch)?\\s*(\\d+(?:\\.\\d+)?)\\s*(?:mcg|micrograms?)(?:\\s*\\/\\s*hr|\\s*per\\s*hour)?`,
          'i',
        );
        const m = clause.match(re);
        if (m) {
          const doseMcg = parseFloat(m[1]);
          medMap.set(`${rule.canonical}-ER`, {
            name: `${rule.canonical} ${doseMcg} mcg/hr`,
            doseMg: doseMcg,
            dosesPerDay: 1,
            conversionFactor: rule.factor,
            dailyMME: Math.round(doseMcg * rule.factor * 10) / 10,
          });
        }
        continue;
      }

      // Support ranges like "oxycodone 5 to 10 mg" (uses upper bound for safety) and standard "oxycodone 7.5 mg"
      const afterDrugRange = new RegExp(
        `\\b${rule.drugPattern}\\s*(?:er|ir|xr|sr|hcl|acetaminophen)?\\s*(\\d+(?:\\.\\d+)?)\\s*(?:to|-)\\s*(\\d+(?:\\.\\d+)?)\\s*(?:mg|milligrams?)([^,.;]*)`,
        'i',
      );
      const afterDrug = new RegExp(
        `\\b${rule.drugPattern}\\s*(?:er|ir|xr|sr|hcl|acetaminophen)?\\s*(\\d+(?:\\.\\d+)?)\\s*(?:\\/\\s*\\d+)?\\s*(?:mg|milligrams?)?([^,.;]*)`,
        'i',
      );
      const beforeDrug = new RegExp(
        `(\\d+(?:\\.\\d+)?)\\s*(?:mg|milligrams?)\\s*(?:of\\s+)?${rule.drugPattern}\\b([^,.;]*)`,
        'i',
      );

      let doseMg = 0;
      let localWindow = '';
      const rangeMatch = clause.match(afterDrugRange);
      if (rangeMatch) {
        doseMg = parseFloat(rangeMatch[2]); // Upper bound of dose range for max daily MME safety
        localWindow = (rangeMatch[3] ?? '').split(/\b(?:and|plus|with)\b/i)[0].slice(0, 70);
      } else {
        const m = clause.match(afterDrug) || clause.match(beforeDrug);
        if (m) {
          doseMg = parseFloat(m[1]);
          localWindow = (m[2] ?? '').split(/\b(?:and|plus|with)\b/i)[0].slice(0, 70);
        }
      }

      if (doseMg > 0 && doseMg <= 200) {
        const tabletsPerDose = parseTabletsPerDose(localWindow);
        const dosesPerDay = parseFrequencyPerDay(localWindow) * tabletsPerDose;
        const totalDailyMg = doseMg * dosesPerDay;
        const factor = rule.unit === 'methadone' ? methadoneFactor(totalDailyMg) : rule.factor;
        const formulation = detectFormulation(clause, rule.drugPattern);
        const dailyMME = Math.round(totalDailyMg * factor * 10) / 10;

        medMap.set(`${rule.canonical}-${formulation}`, {
          name: formulation === 'ER' ? `${rule.canonical} ER` : rule.canonical,
          doseMg,
          dosesPerDay,
          conversionFactor: factor,
          dailyMME,
        });
      }
    }
  }

  const medications = Array.from(medMap.values());
  const totalDailyMME = Math.round(medications.reduce((sum, m) => sum + m.dailyMME, 0) * 10) / 10;

  const concurrentBenzo =
    BENZO_PATTERN.test(text) &&
    !/\b(no|denies|stopped|discontinued)\s+(?:benzo|alprazolam|xanax|lorazepam|ativan|clonazepam|klonopin|diazepam|valium)/i.test(
      text,
    );

  const concurrentSoma =
    CARISOPRODOL_PATTERN.test(text) &&
    !/\b(no|denies|stopped|discontinued)\s+(?:carisoprodol|soma)/i.test(text);

  const hasBuprenorphine =
    BUPRENORPHINE_PATTERN.test(text) &&
    !/\b(no|denies|stopped|discontinued)\s+(?:buprenorphine|suboxone|subutex|belbuca|butrans)/i.test(text);

  let riskTier: MMEResult['riskTier'] = 'none';
  if (totalDailyMME >= 90) riskTier = 'high';
  else if (totalDailyMME >= 50) riskTier = 'moderate';
  else if (totalDailyMME > 0) riskTier = 'low';

  const alerts: string[] = [];
  if (totalDailyMME >= 90) {
    alerts.push('High opioid dose (>=90 MME/day): Document clinical justification, PDMP, UDS, and taper/risk mitigation plan.');
  } else if (totalDailyMME >= 50) {
    alerts.push('Elevated opioid dose (>=50 MME/day): CDC recommends offering rescue Naloxone and reassessing benefit vs. risk.');
  }
  if (concurrentBenzo && concurrentSoma && totalDailyMME > 0) {
    alerts.push('High-Risk Combination ("Holy Trinity"): Concurrent opioid + benzodiazepine + carisoprodol detected — high respiratory depression risk.');
  } else if (concurrentBenzo && totalDailyMME > 0) {
    alerts.push('FDA Boxed Warning: Concurrent opioid + benzodiazepine use detected — document respiratory depression counseling & Naloxone.');
  }
  if (hasBuprenorphine) {
    alerts.push('Buprenorphine detected: Partial opioid agonist — CDC does not assign a standard MME conversion factor.');
  }

  const naloxoneRecommended = totalDailyMME >= 50 || ((concurrentBenzo || concurrentSoma) && totalDailyMME > 0);

  const confirmedNoOpioids =
    totalDailyMME === 0 &&
    !hasBuprenorphine &&
    /\b(no\s+opioids?|denies\s+opioids?|non-?opioid|not\s+taking\s+(?:any\s+)?opioids?|no\s+controlled\s+substances?)\b/i.test(
      text,
    );
  const medicationStatus: MMEResult['medicationStatus'] =
    totalDailyMME > 0 || hasBuprenorphine ? 'opioid_active' : confirmedNoOpioids ? 'confirmed_none' : 'unknown';

  return {
    totalDailyMME,
    riskTier,
    medicationStatus,
    medications,
    alerts,
    concurrentBenzo,
    naloxoneRecommended,
  };
}
