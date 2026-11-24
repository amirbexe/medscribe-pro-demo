import type {
  DrChronoClinicalNotePayload,
  DrChronoFieldValue,
  DrChronoSyncResult,
  PainNote,
} from '../types.js';
import { getTemplate } from '../templates/index.js';

export interface DrChronoOptions {
  appointmentId?: number;
  patientId?: number;
  doctorId?: number;
  /** Optional custom mapping from internal field key -> DrChrono clinical_note_field integer ID */
  fieldIdMap?: Record<string, number | string>;
}

/**
 * Semantic keywords used by the Chrome Extension content script to discover and fill
 * DrChrono clinical note inputs/textareas/contenteditable regions reliably.
 */
export const DRCHRONO_DOM_SELECTOR_MAP: Record<string, string[]> = {
  chief_complaint: ['chief complaint', 'chief_complaint', 'reason for visit', 'cc'],
  hpi_opqrst: ['hpi', 'history of present illness', 'present illness', 'subjective', 'interval history'],
  pain_scores: ['pain score', 'pain scale', 'nrs', 'vas', 'pain severity'],
  functional_peg: ['functional', 'peg', 'adl', 'activity'],
  red_flags: ['red flag', 'ros', 'review of systems', 'cauda equina'],
  medications_mme: ['medication', 'pain regimen', 'mme', 'opioid'],
  pdmp_uds_compliance: ['pdmp', 'uds', 'urine drug', 'compliance', 'naloxone', 'opioid agreement'],
  psychosocial_ort: ['social history', 'psychosocial', 'ort', 'opioid risk'],
  prior_treatments: ['prior treatment', 'conservative', 'past medical', 'pmh'],
  physical_exam: ['physical exam', 'objective', 'exam', 'musculoskeletal', 'neurologic'],
  diagnostics_imaging: ['imaging', 'diagnostic', 'mri', 'radiology', 'results'],
  assessment: ['assessment', 'impression', 'diagnosis'],
  plan: ['plan', 'treatment plan', 'follow up', 'follow-up', 'discharge'],
  procedure_performed: ['procedure', 'operation', 'intervention'],
  pre_post_dx: ['pre-op', 'pre-procedure', 'diagnosis'],
  consent_timeout_anticoag: ['consent', 'time-out', 'timeout', 'anticoag'],
  pre_procedure_nrs: ['pre-procedure pain', 'pre pain', 'baseline pain'],
  guidance_contrast: ['technique', 'fluoroscopy', 'guidance', 'contrast', 'procedure description'],
  injectate_meds: ['injectate', 'medication administered', 'solution'],
  sedation_monitoring: ['anesthesia', 'sedation', 'monitoring'],
  complications_ebl: ['complications', 'blood loss', 'ebl'],
  post_procedure_nrs: ['post-procedure pain', 'post pain', 'relief'],
  discharge_followup: ['discharge', 'post-op', 'follow-up', 'plan'],
};

export function formatPainNoteNarrative(note: PainNote): string {
  const template = getTemplate(note.templateId);
  const lines: string[] = [];

  lines.push(`=== ${template.name.toUpperCase()} ===`);
  lines.push(`Generated: ${new Date(note.updatedAt).toLocaleString()}`);

  if (note.mme.totalDailyMME > 0) {
    lines.push(
      `Daily MME: ${note.mme.totalDailyMME} MME/day (${note.mme.riskTier.toUpperCase()} risk${
        note.mme.concurrentBenzo ? ' | CONCURRENT BENZO ALERT' : ''
      })`,
    );
  }
  if (note.peg.composite !== null) {
    lines.push(
      `PEG-3 Composite: ${note.peg.composite}/10 (${note.peg.severity.toUpperCase()} — P:${
        note.peg.painAverage ?? '-'
      } E:${note.peg.enjoymentInterference ?? '-'} G:${note.peg.generalActivityInterference ?? '-'})`,
    );
  }

  lines.push('');

  let currentSection = '';
  for (const def of template.fields) {
    const fieldVal = note.fields[def.key];
    if (def.section !== currentSection) {
      currentSection = def.section;
      lines.push(`[${currentSection.toUpperCase()}]`);
    }
    const val = fieldVal?.value?.trim() || '[Not documented]';
    lines.push(`${def.label}:`);
    lines.push(val);
    lines.push('');
  }

  const selectedIcd = note.codes.filter((c) => c.system === 'ICD-10' && c.selected);
  const selectedCpt = note.codes.filter((c) => c.system === 'CPT' && c.selected);

  if (selectedIcd.length > 0) {
    lines.push('[ICD-10 CODES]');
    for (const c of selectedIcd) {
      lines.push(`- ${c.code}: ${c.description}`);
    }
    lines.push('');
  }

  if (selectedCpt.length > 0) {
    lines.push('[CPT CODES]');
    for (const c of selectedCpt) {
      lines.push(`- ${c.code}: ${c.description}`);
    }
    lines.push('');
  }

  if (note.transcriptPurged && note.purgeReceipt) {
    lines.push(
      `[PRIVACY] Raw encounter transcript permanently purged (${note.purgeReceipt.receiptId} | Zero-Retention Verified)`,
    );
  }

  return lines.join('\n').trim();
}

export function buildDrChronoPayload(
  note: PainNote,
  options: DrChronoOptions = {},
): DrChronoClinicalNotePayload {
  const template = getTemplate(note.templateId);
  const fieldValues: DrChronoFieldValue[] = [];

  for (const def of template.fields) {
    const val = note.fields[def.key]?.value?.trim();
    if (!val) continue;
    fieldValues.push({
      clinical_note_field: options.fieldIdMap?.[def.key] ?? def.drChronoFieldHint,
      field_label: def.label,
      section: def.section,
      value: val,
    });
  }

  return {
    appointment_id: options.appointmentId,
    patient_id: options.patientId,
    doctor_id: options.doctorId,
    template_name: template.drChronoTemplateName,
    generated_at: new Date().toISOString(),
    clinical_note_field_values: fieldValues,
    icd10_codes: note.codes.filter((c) => c.system === 'ICD-10' && c.selected).map((c) => c.code),
    cpt_codes: note.codes.filter((c) => c.system === 'CPT' && c.selected).map((c) => c.code),
    formatted_narrative: formatPainNoteNarrative(note),
    mme_daily_total: note.mme.totalDailyMME,
    peg_composite_score: note.peg.composite,
  };
}

/**
 * Pushes a PainNote to DrChrono's Clinical Notes API (or executes a validated dry-run if no OAuth token is provided).
 */
export async function syncToDrChrono(
  note: PainNote,
  config: {
    accessToken?: string;
    appointmentId?: number;
    patientId?: number;
    doctorId?: number;
    apiBaseUrl?: string;
    fieldIdMap?: Record<string, number | string>;
    existingFieldValueIds?: Record<string, number>;
  } = {},
): Promise<DrChronoSyncResult> {
  const payload = buildDrChronoPayload(note, {
    appointmentId: config.appointmentId,
    patientId: config.patientId,
    doctorId: config.doctorId,
    fieldIdMap: config.fieldIdMap,
  });

  const template = getTemplate(note.templateId);
  const totalFields = template.fields.length;
  const fieldsPopulated = payload.clinical_note_field_values.length;
  const fieldsSkipped = Math.max(0, totalFields - fieldsPopulated);

  if (!config.accessToken) {
    return {
      success: true,
      mode: 'preview_only',
      syncedAt: new Date().toISOString(),
      fieldsPopulated,
      fieldsSkipped,
      message: `Prepared DrChrono preview (${fieldsPopulated}/${totalFields} fields). Not yet saved to DrChrono — copy the narrative, connect an OAuth token, or inject via the Chrome Extension.`,
      payload,
    };
  }

  if (!config.appointmentId) {
    throw new Error('DrChrono Appointment ID is required to save clinical note field values.');
  }

  const baseUrl = (config.apiBaseUrl ?? 'https://app.drchrono.com').replace(/\/$/, '');
  let savedCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  // DrChrono v4: /api/clinical_notes is read-only; writes target /api/clinical_note_field_values
  for (const field of payload.clinical_note_field_values) {
    const numericFieldId = Number(field.clinical_note_field);
    if (!Number.isInteger(numericFieldId) || numericFieldId <= 0) {
      failedCount++;
      errors.push(`Skipped "${field.field_label}": requires numeric DrChrono clinical_note_field ID.`);
      continue;
    }

    const existingId = config.existingFieldValueIds?.[String(field.clinical_note_field)];
    const endpoint = existingId
      ? `${baseUrl}/api/clinical_note_field_values/${existingId}`
      : `${baseUrl}/api/clinical_note_field_values`;

    const response = await fetch(endpoint, {
      method: existingId ? 'PATCH' : 'POST',
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        appointment: config.appointmentId,
        clinical_note_field: numericFieldId,
        value: field.value,
      }),
    });

    if (!response.ok) {
      failedCount++;
      const errorText = await response.text().catch(() => response.statusText);
      errors.push(`${field.field_label} (${response.status}): ${errorText}`);
    } else {
      savedCount++;
    }
  }

  if (savedCount === 0 && failedCount > 0) {
    throw new Error(`DrChrono API save failed: ${errors.slice(0, 2).join('; ')}`);
  }

  return {
    success: failedCount === 0,
    mode: 'api_saved',
    syncedAt: new Date().toISOString(),
    fieldsPopulated: savedCount,
    fieldsSkipped,
    fieldsFailed: failedCount,
    message:
      failedCount === 0
        ? `Saved ${savedCount} clinical note field values directly to DrChrono appointment #${config.appointmentId}.`
        : `Saved ${savedCount} fields to DrChrono (${failedCount} failed: ${errors[0]}).`,
    payload,
  };
}
