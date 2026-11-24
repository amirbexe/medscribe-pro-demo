import type { BillingCode, TemplateId } from '../types.js';

interface CodeRule {
  code: string;
  system: 'ICD-10' | 'CPT';
  description: string;
  patterns: RegExp[];
  confidence: number;
  templates?: TemplateId[];
}

const PAIN_CODE_RULES: CodeRule[] = [
  // ICD-10 Pain Management
  {
    code: 'M54.16',
    system: 'ICD-10',
    description: 'Radiculopathy, lumbar region',
    patterns: [/\b(lumbar\s*radiculopathy|sciatica|radiat(?:ing|es?)\s*(?:down|into)\s*(?:the\s*)?(?:right|left|bilateral)?\s*(?:leg|buttock|calf|foot)|l4|l5|s1)\b/i],
    confidence: 0.92,
  },
  {
    code: 'M51.16',
    system: 'ICD-10',
    description: 'Intervertebral disc disorders with radiculopathy, lumbar region',
    patterns: [/\b(disc\s*(?:herniation|protrusion|extrusion|bulge).*?(?:lumbar|l4|l5|s1)|l4-?l5|l5-?s1)\b/i],
    confidence: 0.9,
  },
  {
    code: 'M54.50',
    system: 'ICD-10',
    description: 'Low back pain, unspecified',
    patterns: [/\b(low\s*back\s*pain|lumbar\s*(?:pain|back\s*pain)|lbp)\b/i],
    confidence: 0.85,
  },
  {
    code: 'M47.816',
    system: 'ICD-10',
    description: 'Spondylosis without myelopathy or radiculopathy, lumbar region (facet arthropathy)',
    patterns: [/\b(lumbar\s*facet|facet\s*(?:arthropathy|mediated|loading|joint)|spondylosis)\b/i],
    confidence: 0.91,
  },
  {
    code: 'M54.12',
    system: 'ICD-10',
    description: 'Radiculopathy, cervical region',
    patterns: [/\b(cervical\s*radiculopathy|neck\s*pain.*?(?:arm|hand|finger)|c5|c6|c7|spurling)\b/i],
    confidence: 0.91,
  },
  {
    code: 'M48.061',
    system: 'ICD-10',
    description: 'Spinal stenosis, lumbar region without neurogenic claudication',
    patterns: [/\b(spinal\s*stenosis|central\s*canal\s*stenosis|foraminal\s*stenosis)\b/i],
    confidence: 0.88,
  },
  {
    code: 'M46.1',
    system: 'ICD-10',
    description: 'Sacroiliitis, not elsewhere classified',
    patterns: [/\b(sacroiliac|si\s*joint|sacroiliitis|faber)\b/i],
    confidence: 0.87,
  },
  {
    code: 'G89.29',
    system: 'ICD-10',
    description: 'Other chronic pain',
    patterns: [/\b(chronic\s*(?:pain|low\s*back|neck)|months|years)\b/i],
    confidence: 0.86,
  },
  {
    code: 'Z79.891',
    system: 'ICD-10',
    description: 'Long term (current) use of opiate analgesic',
    patterns: [/\b(oxycodone|hydrocodone|norco|percocet|morphine|hydromorphone|tramadol|fentanyl|opioid)\b/i],
    confidence: 0.94,
  },
  {
    code: 'G89.4',
    system: 'ICD-10',
    description: 'Chronic pain syndrome',
    patterns: [/\b(chronic\s*pain\s*syndrome|functional\s*impairment|peg)\b/i],
    confidence: 0.82,
  },

  {
    code: 'I10',
    system: 'ICD-10',
    description: 'Essential (primary) hypertension',
    patterns: [/\b(hypertension|elevated\s*bp|high\s*blood\s*pressure|htn)\b/i],
    confidence: 0.92,
  },
  {
    code: 'I50.9',
    system: 'ICD-10',
    description: 'Heart failure, unspecified',
    patterns: [/\b(chf|heart\s*failure|volume\s*overload)\b/i],
    confidence: 0.91,
  },
  {
    code: 'E11.9',
    system: 'ICD-10',
    description: 'Type 2 diabetes mellitus without complications',
    patterns: [/\b(type\s*2\s*diabetes|diabetes\s*mellitus|t2dm)\b/i],
    confidence: 0.9,
  },
  {
    code: 'R06.02',
    system: 'ICD-10',
    description: 'Shortness of breath',
    patterns: [/\b(dyspnea|shortness\s*of\s*breath|sob)\b/i],
    confidence: 0.89,
  },

  // CPT E/M & Interventional Procedures
  {
    code: '99214',
    system: 'CPT',
    description: 'Office/outpatient established visit, moderate complexity (30-39 min)',
    patterns: [/.+/],
    confidence: 0.88,
    templates: ['pain_followup', 'general_soap'],
  },
  {
    code: '99204',
    system: 'CPT',
    description: 'Office/outpatient new patient visit, moderate complexity (45-59 min)',
    patterns: [/.+/],
    confidence: 0.88,
    templates: ['pain_initial'],
  },
  {
    code: '64483',
    system: 'CPT',
    description: 'Transforaminal epidural steroid injection, lumbar/sacral, single level',
    patterns: [/\b(transforaminal|tfesi)\b/i],
    confidence: 0.95,
    templates: ['pain_procedure'],
  },
  {
    code: '62323',
    system: 'CPT',
    description: 'Interlaminar epidural steroid injection, lumbar/sacral, with imaging guidance',
    patterns: [/\b(interlaminar|ilesi|caudal\s*epidural)\b/i],
    confidence: 0.93,
    templates: ['pain_procedure'],
  },
  {
    code: '64493',
    system: 'CPT',
    description: 'Paravertebral facet joint / medial branch block, lumbar/sacral, single level',
    patterns: [/\b(medial\s*branch|mbb|facet\s*joint\s*injection)\b/i],
    confidence: 0.94,
    templates: ['pain_procedure'],
  },
  {
    code: '64635',
    system: 'CPT',
    description: 'Radiofrequency ablation (RFA), lumbar/sacral facet joint, single level',
    patterns: [/\b(radiofrequency|rfa|rhizotomy|neurotomy)\b/i],
    confidence: 0.94,
    templates: ['pain_procedure'],
  },
  {
    code: '27096',
    system: 'CPT',
    description: 'Sacroiliac joint injection with imaging guidance',
    patterns: [/\b(si\s*joint\s*injection|sacroiliac\s*joint\s*injection)\b/i],
    confidence: 0.93,
    templates: ['pain_procedure'],
  },
];

const NEGATION_OR_CANCEL_PREFIX =
  /\b(?:no|denies|denied|without|negative\s+for|ruled\s+out|r\/o|history\s+of|prior|cancelled|canceled|deferred|not\s+performed|declined)\s+(?:any\s+|evidence\s+of\s+)?$/i;

const NEGATION_OR_CANCEL_SUFFIX =
  /^\s*(?:is\s+|was\s+)?(?:ruled\s+out|negative|absent|cancelled|canceled|deferred|not\s+performed|declined|postponed)\b/i;

function hasAffirmativeMatch(text: string, patterns: RegExp[]): boolean {
  const sentences = text.split(/[?!;\n]+|(?<!\d)\.|\.(?!\d)/);
  for (const sentence of sentences) {
    for (const pattern of patterns) {
      const m = pattern.exec(sentence);
      if (!m) continue;
      // Wildcard E/M rules like /.+/ are always affirmative
      if (pattern.source === '.+') return true;
      const before = sentence.slice(Math.max(0, m.index - 45), m.index);
      const after = sentence.slice(m.index + m[0].length, m.index + m[0].length + 45);
      if (NEGATION_OR_CANCEL_PREFIX.test(before) || NEGATION_OR_CANCEL_SUFFIX.test(after)) {
        continue;
      }
      return true;
    }
  }
  return false;
}

export function suggestBillingCodes(text: string, templateId: TemplateId): BillingCode[] {
  const results: BillingCode[] = [];

  for (const rule of PAIN_CODE_RULES) {
    if (rule.templates && !rule.templates.includes(templateId)) continue;
    if (hasAffirmativeMatch(text, rule.patterns)) {
      results.push({
        code: rule.code,
        system: rule.system,
        description: rule.description,
        confidence: rule.confidence,
        // Require explicit clinician confirmation before billing codes are submitted
        selected: false,
      });
    }
  }

  return results;
}
