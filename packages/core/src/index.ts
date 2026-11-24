import type { ClinicalFieldDefinition, ClinicalFieldValue, PainNote } from './types.js';
import { getTemplate } from './templates/index.js';
import { calculateMMEFromText } from './clinical/mme.js';
import { computePEGScore, extractPEGFromText } from './clinical/peg.js';

export * from './types.js';
export * from './templates/index.js';
export * from './clinical/mme.js';
export * from './clinical/peg.js';
export * from './clinical/icd10-cpt.js';
export * from './ephemeral/vault.js';
export * from './emr/drchrono.js';
export * from './ai/prompt-builder.js';
export * from './ai/demo-engine.js';
export * from './ai/providers.js';
export * from './samples/encounters.js';

export interface NoteCompletionStats {
  total: number;
  filled: number;
  partial: number;
  missing: number;
  requiredRemaining: number;
  complianceRemaining: number;
  percentComplete: number;
}

export function getNoteCompletionStats(note: PainNote): NoteCompletionStats {
  const template = getTemplate(note.templateId);
  let filled = 0;
  let partial = 0;
  let missing = 0;
  let requiredRemaining = 0;
  let complianceRemaining = 0;

  for (const def of template.fields) {
    const f = note.fields[def.key];
    if (!f || f.status === 'missing') {
      missing++;
      if (def.required) requiredRemaining++;
      if (def.complianceCritical) complianceRemaining++;
    } else if (f.status === 'partial') {
      partial++;
      if (def.required) requiredRemaining++;
      if (def.complianceCritical) complianceRemaining++;
    } else {
      filled++;
    }
  }

  const total = template.fields.length;
  const percentComplete = total === 0 ? 100 : Math.round(((filled + partial * 0.5) / total) * 100);

  return {
    total,
    filled,
    partial,
    missing,
    requiredRemaining,
    complianceRemaining,
    percentComplete,
  };
}

export function getUnansweredFields(
  note: PainNote,
): Array<{ definition: ClinicalFieldDefinition; field: ClinicalFieldValue }> {
  const template = getTemplate(note.templateId);
  const gaps: Array<{ definition: ClinicalFieldDefinition; field: ClinicalFieldValue }> = [];

  for (const def of template.fields) {
    const field = note.fields[def.key];
    if (!field || field.status === 'missing' || field.status === 'partial') {
      gaps.push({
        definition: def,
        field: field ?? {
          key: def.key,
          value: '',
          status: 'missing',
          provenance: 'unverified',
          confidence: 0,
          suggestions: [],
        },
      });
    }
  }

  // Sort compliance-critical and missing fields first
  return gaps.sort((a, b) => {
    const aScore = (a.definition.complianceCritical ? 4 : 0) + (a.field.status === 'missing' ? 2 : 1);
    const bScore = (b.definition.complianceCritical ? 4 : 0) + (b.field.status === 'missing' ? 2 : 1);
    return bScore - aScore;
  });
}

export function recalculateNoteMetrics(note: PainNote): PainNote {
  const medText = [
    note.fields.medications_mme?.value ?? '',
    note.fields.plan?.value ?? '',
    note.fields.pdmp_uds_compliance?.value ?? '',
  ].join('\n');

  const pegText = [
    note.fields.functional_peg?.value ?? '',
    note.fields.pain_scores?.value ?? '',
  ].join('\n');

  const mme = medText.trim() ? calculateMMEFromText(medText) : note.mme;
  const extractedPeg = extractPEGFromText(pegText);
  const peg = extractedPeg.composite !== null ? extractedPeg : note.peg;

  return {
    ...note,
    mme,
    peg,
  };
}

export function updatePEGScores(
  note: PainNote,
  painAverage: number | null,
  enjoymentInterference: number | null,
  generalActivityInterference: number | null,
): PainNote {
  const peg = computePEGScore(painAverage, enjoymentInterference, generalActivityInterference);
  const currentFunc = note.fields.functional_peg;
  const pegLine =
    peg.composite !== null
      ? `PEG-3 Composite: ${peg.composite}/10 (${peg.severity.toUpperCase()} — Pain ${painAverage ?? '–'}/10, Enjoyment ${enjoymentInterference ?? '–'}/10, General Activity ${generalActivityInterference ?? '–'}/10).`
      : '';

  const fields = { ...note.fields };
  if (currentFunc && pegLine) {
    const cleaned = currentFunc.value.replace(/PEG-3 Composite:[^\n.]*\.?/i, '').trim();
    fields.functional_peg = {
      ...currentFunc,
      value: cleaned ? `${pegLine} ${cleaned}` : pegLine,
      status: 'filled',
      provenance: 'clinician_confirmed',
      manuallyEdited: true,
    };
  }

  return {
    ...note,
    updatedAt: new Date().toISOString(),
    peg,
    fields,
  };
}

export function applySuggestionToNote(
  note: PainNote,
  fieldKey: string,
  suggestionId: string,
  mode: 'replace' | 'append' = 'replace',
): PainNote {
  const current = note.fields[fieldKey];
  if (!current) return note;
  const suggestion = current.suggestions.find((s) => s.id === suggestionId);
  if (!suggestion) return note;

  const nextValue =
    mode === 'append' && current.value.trim()
      ? `${current.value.trim()}\n${suggestion.value}`
      : suggestion.value;

  const nextNote: PainNote = {
    ...note,
    updatedAt: new Date().toISOString(),
    fields: {
      ...note.fields,
      [fieldKey]: {
        ...current,
        value: nextValue,
        status: 'filled',
        provenance: 'clinician_confirmed',
        confidence: suggestion.confidence,
        acceptedSuggestionId: suggestion.id,
      },
    },
  };

  return recalculateNoteMetrics(nextNote);
}

export function updateFieldValue(note: PainNote, fieldKey: string, value: string): PainNote {
  const current = note.fields[fieldKey];
  if (!current) return note;
  const trimmed = value.trim();

  const nextNote: PainNote = {
    ...note,
    updatedAt: new Date().toISOString(),
    fields: {
      ...note.fields,
      [fieldKey]: {
        ...current,
        value,
        status: trimmed.length > 0 ? 'filled' : 'missing',
        provenance: trimmed.length > 0 ? 'clinician_edited' : 'unverified',
        manuallyEdited: true,
      },
    },
  };

  return recalculateNoteMetrics(nextNote);
}
