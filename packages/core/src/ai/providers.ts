import type {
  ClinicalFieldValue,
  FieldSuggestion,
  LLMConfig,
  PainNote,
  TemplateId,
} from '../types.js';
import { getTemplate } from '../templates/index.js';
import { calculateMMEFromText } from '../clinical/mme.js';
import { extractPEGFromText } from '../clinical/peg.js';
import { suggestBillingCodes } from '../clinical/icd10-cpt.js';
import { buildPainExtractionSystemPrompt, buildPainExtractionUserPrompt } from './prompt-builder.js';
import { runDemoPainExtraction } from './demo-engine.js';

interface RawLLMField {
  value?: string;
  status?: 'filled' | 'partial' | 'missing';
  confidence?: number;
  sourceQuote?: string;
  suggestions?: FieldSuggestion[];
}

interface RawLLMResponse {
  fields?: Record<string, RawLLMField>;
}

function parseJSONSafely(raw: string): RawLLMResponse {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) {
    throw new Error('LLM did not return a JSON object.');
  }
  return JSON.parse(cleaned.slice(start, end + 1)) as RawLLMResponse;
}

async function callAnthropic(systemPrompt: string, userPrompt: string, config: LLMConfig): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': config.apiKey!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: config.model || 'claude-3-5-sonnet-latest',
      max_tokens: 4096,
      temperature: 0.1,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Anthropic API error (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { content?: Array<{ text?: string }> };
  return data.content?.map((c) => c.text ?? '').join('\n') ?? '';
}

async function callOpenAI(systemPrompt: string, userPrompt: string, config: LLMConfig): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey!}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model || 'gpt-4o-mini',
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI API error (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? '';
}

async function callGemini(systemPrompt: string, userPrompt: string, config: LLMConfig): Promise<string> {
  const model = config.model || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent?key=${encodeURIComponent(config.apiKey!)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`Gemini API error (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('\n') ?? '';
}

/**
 * Extracts a structured PainNote from a raw encounter transcript.
 * Uses the configured BYOK LLM provider (Anthropic / OpenAI / Gemini), or falls back cleanly
 * to the built-in zero-key Pain Management clinical engine.
 */
export async function extractPainNote(
  transcript: string,
  templateId: TemplateId,
  config: LLMConfig = { provider: 'demo' },
): Promise<PainNote> {
  const trimmed = transcript.trim();
  if (!trimmed) {
    throw new Error('Cannot extract a note from an empty transcript.');
  }

  if (config.provider === 'demo' || !config.apiKey?.trim()) {
    return runDemoPainExtraction(trimmed, templateId);
  }

  const systemPrompt = buildPainExtractionSystemPrompt(templateId);
  const userPrompt = buildPainExtractionUserPrompt(trimmed);

  let rawText = '';
  if (config.provider === 'anthropic') {
    rawText = await callAnthropic(systemPrompt, userPrompt, config);
  } else if (config.provider === 'openai') {
    rawText = await callOpenAI(systemPrompt, userPrompt, config);
  } else if (config.provider === 'gemini') {
    rawText = await callGemini(systemPrompt, userPrompt, config);
  }

  const parsed = parseJSONSafely(rawText);
  const template = getTemplate(templateId);
  const fallbackDemo = runDemoPainExtraction(trimmed, templateId);
  const now = new Date().toISOString();

  const fields: Record<string, ClinicalFieldValue> = {};
  for (const def of template.fields) {
    const aiField = parsed.fields?.[def.key];
    const demoField = fallbackDemo.fields[def.key];

    if (aiField) {
      const status = aiField.status ?? (aiField.value?.trim() ? 'filled' : 'missing');
      fields[def.key] = {
        key: def.key,
        value: aiField.value ?? '',
        status,
        provenance: status === 'filled' ? 'transcript' : 'unverified',
        confidence: typeof aiField.confidence === 'number' ? aiField.confidence : status === 'filled' ? 0.9 : 0.4,
        sourceQuote: aiField.sourceQuote,
        suggestions:
          status === 'filled'
            ? []
            : (Array.isArray(aiField.suggestions) && aiField.suggestions.length > 0
                ? aiField.suggestions
                : demoField.suggestions
              ).map((s) => ({
                ...s,
                requiresClinicianConfirmation:
                  s.requiresClinicianConfirmation ?? (def.complianceCritical === true || status === 'missing'),
              })),
      };
    } else {
      fields[def.key] = demoField;
    }
  }

  return {
    id: `note_${Date.now().toString(36)}`,
    templateId,
    createdAt: now,
    updatedAt: now,
    fields,
    mme: calculateMMEFromText(trimmed),
    peg: extractPEGFromText(trimmed),
    codes: suggestBillingCodes(trimmed, templateId),
    transcriptPurged: false,
  };
}
