import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EphemeralTranscriptVault,
  SAMPLE_ENCOUNTERS,
  applySuggestionToNote,
  buildDrChronoPayload,
  calculateMMEFromText,
  extractPEGFromText,
  extractPainNote,
  finalizeNoteWithPurge,
  getNoteCompletionStats,
  getUnansweredFields,
  suggestBillingCodes,
  updateFieldValue,
} from '../index.js';

test('MME calculator computes CDC daily MME, decimal doses (7.5 mg qid = 45), and benzo alert', () => {
  const result = calculateMMEFromText(
    'Patient takes oxycodone 10 mg four times a day and alprazolam 0.5 mg at night.',
  );
  assert.equal(result.totalDailyMME, 60);
  assert.equal(result.riskTier, 'moderate');
  assert.equal(result.medicationStatus, 'opioid_active');
  assert.equal(result.concurrentBenzo, true);
  assert.equal(result.naloxoneRecommended, true);
  assert.ok(result.alerts.length >= 2);

  // Regression test for decimal dose preservation
  const decimalResult = calculateMMEFromText('Patient takes oxycodone 7.5 mg qid for lumbar pain.');
  assert.equal(decimalResult.totalDailyMME, 45);
  assert.equal(decimalResult.riskTier, 'low');

  // Distinguishes confirmed non-opioid vs unknown
  const confirmedNone = calculateMMEFromText('Patient denies opioids and takes meloxicam 15 mg daily.');
  assert.equal(confirmedNone.medicationStatus, 'confirmed_none');
  const unknown = calculateMMEFromText('Patient presents for lumbar MRI review.');
  assert.equal(unknown.medicationStatus, 'unknown');
});

test('PEG-3 extractor computes composite score including 10/10 without truncating to 1/10', () => {
  const peg = extractPEGFromText(
    'Average pain is 6 out of 10. Enjoyment of life is 8 out of 10 and general activity is 7 out of 10.',
  );
  assert.equal(peg.painAverage, 6);
  assert.equal(peg.enjoymentInterference, 8);
  assert.equal(peg.generalActivityInterference, 7);
  assert.equal(peg.composite, 7);
  assert.equal(peg.severity, 'severe');

  // Regression test for 10/10 scores
  const maxPeg = extractPEGFromText(
    'Average pain is 10/10. Enjoyment of life is 10/10 and general activity is 10/10.',
  );
  assert.equal(maxPeg.painAverage, 10);
  assert.equal(maxPeg.enjoymentInterference, 10);
  assert.equal(maxPeg.generalActivityInterference, 10);
  assert.equal(maxPeg.composite, 10);
  assert.equal(maxPeg.severity, 'severe');
});

test('ICD-10/CPT matcher excludes negated/cancelled mentions and defaults selected=false', () => {
  const codes = suggestBillingCodes('No lumbar radiculopathy. TFESI cancelled.', 'pain_procedure');
  assert.equal(
    codes.some((c) => c.code === 'M54.16'),
    false,
    'Negated lumbar radiculopathy should not be suggested',
  );
  assert.equal(
    codes.some((c) => c.code === '64483'),
    false,
    'Cancelled TFESI should not be suggested',
  );

  const affirmative = suggestBillingCodes(
    'Performed right L4-L5 transforaminal epidural steroid injection for lumbar radiculopathy.',
    'pain_procedure',
  );
  const tfesi = affirmative.find((c) => c.code === '64483');
  assert.ok(tfesi);
  assert.equal(tfesi.selected, false, 'Billing codes should require explicit clinician confirmation');
});

test('Demo pain extraction flags provenance, requires clinician confirmation on compliance gaps, and recalculates MME on edit', async () => {
  const sample = SAMPLE_ENCOUNTERS[0];
  const note = await extractPainNote(sample.transcript, sample.templateId, { provider: 'demo' });

  assert.equal(note.mme.totalDailyMME, 60);
  assert.equal(note.fields.chief_complaint.provenance, 'transcript');

  const gaps = getUnansweredFields(note);
  const complianceGap = gaps.find((g) => g.definition.key === 'pdmp_uds_compliance');
  if (!complianceGap) {
    assert.fail('Expected pdmp_uds_compliance to be flagged as a gap');
  }
  assert.equal(complianceGap.field.suggestions[0].requiresClinicianConfirmation, true);

  const beforeStats = getNoteCompletionStats(note);
  const updated = applySuggestionToNote(note, 'pdmp_uds_compliance', complianceGap.field.suggestions[0].id);
  const afterStats = getNoteCompletionStats(updated);
  assert.equal(updated.fields.pdmp_uds_compliance.status, 'filled');
  assert.equal(updated.fields.pdmp_uds_compliance.provenance, 'clinician_confirmed');
  assert.ok(afterStats.filled > beforeStats.filled);

  // Editing medications should immediately recalculate MME
  const edited = updateFieldValue(updated, 'medications_mme', 'Oxycodone 15 mg QID and gabapentin 300 mg TID.');
  assert.equal(edited.mme.totalDailyMME, 90);
  assert.equal(edited.mme.riskTier, 'high');
});

test('EphemeralTranscriptVault zeroes >65KB transcripts without throwing and scrubs note sourceQuotes on purge', async () => {
  const vault = new EphemeralTranscriptVault('test_session_large');
  // 70,000 bytes exceeds crypto.getRandomValues 65,536-byte limit
  const hugeTranscript = 'Doctor: Follow up for chronic lumbar pain. '.repeat(2000);
  vault.setTranscript(hugeTranscript);

  assert.equal(vault.hasData(), true);
  assert.ok(vault.getByteLength() > 65536);

  const receipt = await vault.purge('drchrono_push');
  assert.equal(vault.hasData(), false);
  assert.equal(vault.readTranscript(), '');
  assert.equal(vault.getByteLength(), 0);
  assert.equal(receipt.zeroRetentionVerified, true);
  assert.ok(receipt.bytesZeroed > 65536);
  assert.equal(receipt.verificationHash.length, 64);

  const sample = SAMPLE_ENCOUNTERS[2];
  const note = await extractPainNote(sample.transcript, sample.templateId, { provider: 'demo' });
  const payload = buildDrChronoPayload(note, { appointmentId: 4242 });
  assert.equal(payload.appointment_id, 4242);

  const purgedNote = finalizeNoteWithPurge(note, receipt);
  assert.equal(purgedNote.transcriptPurged, true);
  for (const field of Object.values(purgedNote.fields)) {
    assert.equal(field.sourceQuote, undefined);
  }
});
