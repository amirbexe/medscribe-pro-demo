import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SAMPLE_ENCOUNTERS,
  calculateMMEFromText,
  extractPainNote,
} from '../index.js';

test('CDC Methadone tiered MME conversion factors (4x, 8x, 10x, 12x)', () => {
  assert.equal(calculateMMEFromText('Methadone 5 mg TID.').totalDailyMME, 60); // 15mg * 4
  assert.equal(calculateMMEFromText('Methadone 10 mg TID.').totalDailyMME, 240); // 30mg * 8
  assert.equal(calculateMMEFromText('Methadone 25 mg BID.').totalDailyMME, 500); // 50mg * 10
  assert.equal(calculateMMEFromText('Methadone 35 mg BID.').totalDailyMME, 840); // 70mg * 12
});

test('ER + IR dual opioid regimens sum accurately, while plan dose updates do NOT double-count', () => {
  // Morphine ER 30 mg BID (60 MME) + Oxycodone IR 5 mg Q6H (30 MME) = 90 MME
  const dual = calculateMMEFromText(
    'Patient takes Morphine ER 30 mg BID for baseline pain and Oxycodone 5 mg every 6 hours for breakthrough.',
  );
  assert.equal(dual.totalDailyMME, 90);
  assert.equal(dual.riskTier, 'high');

  // Same IR opioid adjusted in Plan should replace rather than double-count (60 + 90 != 150)
  const planUpdate = calculateMMEFromText(
    'HPI: Currently takes oxycodone 10 mg QID. Plan: Increase oxycodone 15 mg QID for flare.',
  );
  assert.equal(planUpdate.totalDailyMME, 90);
});

test('PRN dose and tablet ranges calculate safe upper-bound daily MME', () => {
  // Hydrocodone 10/325 mg, 1 to 2 tablets every 6 hours = 10 * 2 * 4 * 1.0 = 80 MME
  const prnTabs = calculateMMEFromText(
    'Takes hydrocodone 10/325 mg 1 to 2 tablets every 6 hours PRN severe pain.',
  );
  assert.equal(prnTabs.totalDailyMME, 80);

  // Oxycodone 5 to 10 mg TID = 10 * 3 * 1.5 = 45 MME
  const prnDose = calculateMMEFromText('Takes oxycodone 5 to 10 mg three times a day PRN.');
  assert.equal(prnDose.totalDailyMME, 45);
});

test('Holy Trinity (opioid + benzodiazepine + carisoprodol) and Buprenorphine handling', () => {
  const trinity = calculateMMEFromText(
    'Medications: Hydrocodone 10 mg QID, alprazolam 1 mg BID, and Soma 350 mg TID.',
  );
  assert.equal(trinity.totalDailyMME, 40);
  assert.equal(trinity.naloxoneRecommended, true);
  assert.ok(trinity.alerts.some((a) => /Holy Trinity/i.test(a)));

  const bupe = calculateMMEFromText('Patient takes Suboxone 8 mg BID for chronic pain.');
  assert.equal(bupe.totalDailyMME, 0);
  assert.equal(bupe.medicationStatus, 'opioid_active');
  assert.ok(bupe.alerts.some((a) => /Buprenorphine/i.test(a)));
});

test('Extracted prose strips conversational greetings and prevents medication bleeding into Functional Status', async () => {
  const note = await extractPainNote(SAMPLE_ENCOUNTERS[0].transcript, 'pain_followup', { provider: 'demo' });

  // No "Good morning" or "good to see you" in Chief Complaint or HPI
  assert.equal(/good\s+(?:morning|to\s+see\s+you)/i.test(note.fields.chief_complaint.value), false);
  assert.equal(/good\s+(?:morning|to\s+see\s+you)/i.test(note.fields.hpi_opqrst.value), false);

  // Alprazolam medication sentence must NOT bleed into Functional Status
  assert.equal(/alprazolam/i.test(note.fields.functional_peg.value), false);
  // Alprazolam MUST be captured in Medications
  assert.equal(/alprazolam/i.test(note.fields.medications_mme.value), true);
});

test('Multi-specialty General SOAP extracts outpatient cardiology visit and flags missing allergies/red flags', async () => {
  const sample = SAMPLE_ENCOUNTERS.find((s) => s.id === 'outpatient_cardio_followup');
  assert.ok(sample);
  const note = await extractPainNote(sample.transcript, 'general_soap', { provider: 'demo' });

  assert.equal(note.fields.physical_exam.status, 'filled');
  assert.equal(note.fields.assessment.status, 'filled');
  assert.equal(note.fields.plan.status, 'filled');
  assert.equal(note.fields.red_flags.status, 'missing');
  assert.equal(note.fields.medications_mme.status, 'partial');
  assert.ok(note.codes.some((c) => c.code === 'I10'));
  assert.ok(note.codes.some((c) => c.code === 'I50.9'));
  assert.ok(note.codes.some((c) => c.code === '99214'));
});
