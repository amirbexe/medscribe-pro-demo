import type { SampleEncounter } from '../types.js';

export const SAMPLE_ENCOUNTERS: SampleEncounter[] = [
  {
    id: 'lumbar_radic_followup',
    title: 'Lumbar Radiculopathy Follow-Up (60 MME)',
    subtitle: 'Chronic L4-L5 disc herniation on oxycodone + gabapentin; intentionally missing Red Flags, PDMP/UDS/Naloxone, and PEG-3 subscores.',
    templateId: 'pain_followup',
    durationLabel: '4m 15s encounter',
    intentionalGaps: ['Red Flag Screening', 'PDMP / UDS / Naloxone Compliance', 'PEG-3 Subscores'],
    transcript: `Doctor: Good morning Mr. Carter, good to see you back for your chronic low back pain follow-up. How has the right leg pain been since last month?
Patient: Honestly about the same, maybe slightly better in the mornings. It's still an aching low back pain that shoots down my right buttock and into the side of my right calf. Sitting in the car for more than 20 minutes really flares it up, and walking around the grocery store is tough.
Doctor: Where would you rate your pain on a 0 to 10 scale right now?
Patient: Right now it's about a 6 out of 10.
Doctor: And how are the medications working for you? Still taking the oxycodone 10 mg four times a day and gabapentin 300 mg three times a day?
Patient: Yes, oxycodone 10 mg four times a day takes the edge off for a few hours and cuts it down about 40 percent. No drowsiness or stomach issues, just mild constipation that I manage with MiraLAX. I also take alprazolam 0.5 mg at night from my PCP for sleep.
Doctor: Okay, let's check your back and legs. Blood pressure is 128 over 78. On exam, gait is mildly antalgic on the right, lumbar paraspinal tenderness at L4-L5, positive right straight leg raise at 45 degrees reproducing the calf pain. Motor strength is 5/5 throughout L2 to S1 bilaterally, reflexes 2+ symmetric.
Doctor: Reviewing your MRI from three months ago, it showed a right paracentral L4-L5 disc herniation with right L5 nerve root abutment. Your last epidural six months ago gave you about 70 percent relief for four months.
Doctor: My assessment is chronic lumbar radiculopathy secondary to right L4-L5 disc herniation with persistent functional limitation.
Doctor: For the plan, we will continue gabapentin 300 mg TID, hold oxycodone at the current dose for now while we submit prior authorization for a repeat right L4-L5 transforaminal epidural steroid injection, resume lumbar stabilization physical therapy, and follow up in 4 weeks.`,
  },
  {
    id: 'cervical_initial_consult',
    title: 'New Patient Cervical Radiculopathy Consult',
    subtitle: 'Referred by PCP for 14-month neck pain radiating into left arm; intentionally missing Prior Treatments detail, ORT/Psychosocial, and Red Flags.',
    templateId: 'pain_initial',
    durationLabel: '7m 40s encounter',
    intentionalGaps: ['Prior Conservative Treatments', 'Red Flag / Myelopathy Screen', 'Psychosocial & ORT Screen'],
    transcript: `Doctor: Welcome Ms. Alvarez, I see your primary care doctor referred you for neck pain going down your left arm. Tell me how this started.
Patient: It started about 14 months ago after I was rear-ended at a stoplight. Since then I've had constant stiff aching in the left side of my neck with burning pain and pins-and-needles radiating down into my left thumb and index finger.
Doctor: How severe is it on a 0 to 10 scale — average, worst, and best?
Patient: Today it's a 7 out of 10, average is 6 out of 10, worst gets up to 9 out of 10 by the end of a workday at my computer, and best is maybe a 4 out of 10 after a hot shower.
Doctor: How much is it interfering with your daily life?
Patient: Sleep is terrible, I wake up twice a night when I roll onto my left side. Enjoyment of life is probably an 8 out of 10 interference and general activity is a 7 out of 10.
Doctor: What medications are you currently taking, and any allergies?
Patient: Just meloxicam 15 mg daily and cyclobenzaprine 5 mg at bedtime, no opioids. I'm allergic to sulfa drugs. No blood thinners.
Doctor: Let's examine your neck. Cervical range of motion is limited in extension and left rotation. Positive left Spurling maneuver reproducing left C6 paresthesias. Left biceps reflex is slightly diminished at 1+, motor strength 5/5 C5 to T1 bilaterally, Hoffman sign is negative.
Doctor: Your cervical MRI from last month shows moderate-to-severe left C5-C6 foraminal stenosis from a disc-osteophyte complex.
Doctor: My impression is chronic left C6 cervical radiculopathy due to C5-C6 foraminal stenosis.
Doctor: Plan is to start pregabalin 75 mg at bedtime, continue meloxicam, order cervical traction physical therapy, and discuss a left C5-C6 interlaminar epidural steroid injection if symptoms persist at our 4-week follow-up.`,
  },
  {
    id: 'lumbar_tfesi_procedure',
    title: 'Right L4-L5 Transforaminal ESI Procedure',
    subtitle: 'Fluoroscopy-guided TFESI; intentionally missing Universal Time-Out/ASRA details, Sedation/Monitoring, Complications/EBL, and Discharge.',
    templateId: 'pain_procedure',
    durationLabel: '3m 05s dictation',
    intentionalGaps: ['Consent / Time-Out / ASRA Anticoag', 'Sedation & Monitoring', 'Complications & EBL', 'Discharge & Follow-Up'],
    transcript: `Doctor: Dictating procedure note for right L4-L5 transforaminal epidural steroid injection for diagnosis of right L4-L5 lumbar disc herniation with right lumbar radiculopathy.
Doctor: Pre-procedure baseline pain score was 7 out of 10 in the right lower extremity.
Doctor: Patient was placed prone on the fluoroscopy table and prepped and draped in sterile fashion. Using oblique, AP, and lateral C-arm fluoroscopy, a 22-gauge 3.5-inch spinal needle was advanced into the right L4-L5 safe triangle subpedicular position.
Doctor: After negative aspiration, 1.5 mL of Omnipaque 240 contrast was injected under live fluoroscopy confirming a clean right L4-L5 nerve root sleeve and epidural spread with negative intravascular and negative intrathecal uptake.
Doctor: We then injected dexamethasone 10 mg (1 mL) mixed with 1 mL of 0.25% bupivacaine. Skin anesthesia was achieved with 3 mL of 1% lidocaine.
Doctor: Immediately post-procedure in the recovery area, the patient's right leg pain dropped to 1 out of 10, approximately 85 percent immediate relief.`,
  },
  {
    id: 'outpatient_cardio_followup',
    title: 'Hypertension & Dyspnea Follow-Up (General SOAP)',
    subtitle: 'Outpatient internal medicine / cardiology follow-up; intentionally missing Red Flags and Drug Allergies.',
    templateId: 'general_soap',
    durationLabel: '3m 50s encounter',
    intentionalGaps: ['Pertinent ROS & Red Flag Screening', 'Drug Allergies / Adherence'],
    transcript: `Doctor: Welcome back Ms. Ramirez. You mentioned some shortness of breath when walking up stairs over the past week?
Patient: Yes, I've noticed dyspnea on exertion and my ankles look a little more swollen by the evening. I've been taking my lisinopril 20 mg daily and furosemide 20 mg every morning.
Doctor: Let's check your exam. Blood pressure is 148 over 88, heart rate 84, oxygen saturation 96 percent on room air. Lungs have mild bibasilar crackles and trace bilateral lower extremity edema.
Doctor: My assessment is mild CHF exacerbation with uncontrolled essential hypertension.
Doctor: For the plan, we will order a BMP, BNP, and chest x-ray today, increase furosemide to 40 mg daily, continue lisinopril 20 mg daily, review low-sodium diet and daily weights, and follow up in 1 week.`,
  },
];
