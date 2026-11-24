export type TemplateId = 'pain_followup' | 'pain_initial' | 'pain_procedure' | 'general_soap';

export type FieldStatus = 'filled' | 'partial' | 'missing';

export type FieldProvenance = 'transcript' | 'clinician_confirmed' | 'clinician_edited' | 'unverified';

export type FieldSection =
  | 'Subjective'
  | 'Pain & Function'
  | 'Compliance & Risk'
  | 'Objective'
  | 'Procedure Details'
  | 'Assessment & Plan';

export interface FieldSuggestion {
  id: string;
  label: string;
  value: string;
  rationale: string;
  confidence: number; // 0-1
  tag?: 'recommended' | 'conservative' | 'compliance' | 'inferred';
  requiresClinicianConfirmation?: boolean;
}

export interface ClinicalFieldDefinition {
  key: string;
  label: string;
  section: FieldSection;
  required: boolean;
  drChronoFieldHint: string; // e.g., 'chief_complaint', 'hpi', 'assessment', 'plan'
  placeholder: string;
  multiline?: boolean;
  complianceCritical?: boolean;
}

export interface ClinicalFieldValue {
  key: string;
  value: string;
  status: FieldStatus;
  provenance: FieldProvenance;
  confidence: number; // 0-1
  sourceQuote?: string; // Short snippet during active session (cleared on purge!)
  suggestions: FieldSuggestion[];
  acceptedSuggestionId?: string;
  manuallyEdited?: boolean;
}

export interface OpioidMedication {
  name: string;
  doseMg: number;
  dosesPerDay: number;
  conversionFactor: number;
  dailyMME: number;
}

export interface MMEResult {
  totalDailyMME: number;
  riskTier: 'none' | 'low' | 'moderate' | 'high';
  medicationStatus: 'opioid_active' | 'confirmed_none' | 'unknown';
  medications: OpioidMedication[];
  alerts: string[];
  concurrentBenzo: boolean;
  naloxoneRecommended: boolean;
}

export interface PEGScore {
  painAverage: number | null; // 0-10
  enjoymentInterference: number | null; // 0-10
  generalActivityInterference: number | null; // 0-10
  composite: number | null; // average of the 3
  severity: 'unscored' | 'mild' | 'moderate' | 'severe';
}

export interface BillingCode {
  code: string;
  system: 'ICD-10' | 'CPT';
  description: string;
  confidence: number;
  selected: boolean;
}

export interface PainTemplate {
  id: TemplateId;
  name: string;
  shortName: string;
  description: string;
  drChronoTemplateName: string;
  fields: ClinicalFieldDefinition[];
}

export interface PainNote {
  id: string;
  templateId: TemplateId;
  createdAt: string;
  updatedAt: string;
  fields: Record<string, ClinicalFieldValue>;
  mme: MMEResult;
  peg: PEGScore;
  codes: BillingCode[];
  transcriptPurged: boolean;
  purgeReceipt?: PurgeReceipt;
  drChronoSyncedAt?: string;
}

export interface PurgeReceipt {
  receiptId: string;
  sessionId: string;
  purgedAt: string;
  bytesZeroed: number;
  characterCount: number;
  reason: 'drchrono_push' | 'note_finalized' | 'manual_shred' | 'session_reset';
  verificationHash: string; // SHA-256 of metadata + nonce (zero PHI)
  zeroRetentionVerified: true;
}

export type LLMProviderType = 'demo' | 'anthropic' | 'openai' | 'gemini';

export interface LLMConfig {
  provider: LLMProviderType;
  apiKey?: string;
  model?: string;
}

export interface DrChronoFieldValue {
  clinical_note_field: number | string;
  field_label: string;
  section: FieldSection;
  value: string;
}

export interface DrChronoClinicalNotePayload {
  appointment_id?: number;
  patient_id?: number;
  doctor_id?: number;
  template_name: string;
  generated_at: string;
  clinical_note_field_values: DrChronoFieldValue[];
  icd10_codes: string[];
  cpt_codes: string[];
  formatted_narrative: string;
  mme_daily_total: number;
  peg_composite_score: number | null;
}

export interface DrChronoSyncResult {
  success: boolean;
  mode: 'api_saved' | 'extension_inserted' | 'clipboard_copied' | 'preview_only';
  syncedAt: string;
  fieldsPopulated: number;
  fieldsSkipped: number;
  fieldsFailed?: number;
  message: string;
  payload: DrChronoClinicalNotePayload;
}

export interface SampleEncounter {
  id: string;
  title: string;
  subtitle: string;
  templateId: TemplateId;
  durationLabel: string;
  intentionalGaps: string[];
  transcript: string;
}
