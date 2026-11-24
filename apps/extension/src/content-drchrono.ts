import type { DrChronoClinicalNotePayload } from '@medscribe/core';

interface InjectNoteMessage {
  type: 'MEDSCRIBE_INJECT_DRCHRONO';
  payload: DrChronoClinicalNotePayload;
  selectorMap?: Record<string, string[]>;
}

interface PingMessage {
  type: 'MEDSCRIBE_PING_DRCHRONO';
}

type IncomingMessage = InjectNoteMessage | PingMessage;

function getAccessibleLabel(el: HTMLElement): string {
  const parts: string[] = [];
  const id = el.getAttribute('id');
  if (id) {
    const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (label?.textContent) parts.push(label.textContent);
  }
  const closestLabel = el.closest('label');
  if (closestLabel?.textContent) parts.push(closestLabel.textContent);

  const aria = el.getAttribute('aria-label');
  if (aria) parts.push(aria);
  const name = el.getAttribute('name');
  if (name) parts.push(name);
  const placeholder = el.getAttribute('placeholder');
  if (placeholder) parts.push(placeholder);

  // Check nearest section container heading (common in DrChrono clinical note templates)
  const container = el.closest('.clinical-note-field, .form-group, .field-wrapper, section, tr');
  if (container) {
    const heading = container.querySelector('label, h3, h4, .field-label, th');
    if (heading?.textContent) parts.push(heading.textContent);
  }

  return parts.join(' ').toLowerCase();
}

function setElementValue(el: HTMLElement, value: string): { verified: boolean; hadExisting: boolean } {
  let hadExisting = false;
  let verified = false;

  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    hadExisting = el.value.trim().length > 0;
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) {
      setter.call(el, value);
    } else {
      el.value = value;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    verified = el.value === value;
  } else if (el.isContentEditable) {
    hadExisting = (el.textContent ?? '').trim().length > 0;
    el.textContent = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    verified = el.textContent === value;
  }

  if (verified) {
    const prevOutline = el.style.outline;
    el.style.outline = '2px solid #1d4ed8';
    setTimeout(() => {
      el.style.outline = prevOutline;
    }, 2400);
  }

  return { verified, hadExisting };
}

function injectIntoDrChronoDOM(
  payload: DrChronoClinicalNotePayload,
  selectorMap: Record<string, string[]> = {},
): {
  ok: boolean;
  filledCount: number;
  skippedCount: number;
  failedCount: number;
  matchedFields: string[];
  overwrittenFields: string[];
} {
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      'textarea:not([disabled]):not([readonly]), input[type="text"]:not([disabled]):not([readonly]), [contenteditable="true"]',
    ),
  );

  const usedElements = new Set<HTMLElement>();
  const matchedFields: string[] = [];
  const overwrittenFields: string[] = [];
  let filledCount = 0;
  let failedCount = 0;

  for (const item of payload.clinical_note_field_values) {
    const fieldKey = String(item.clinical_note_field);
    const keywords = [
      ...(selectorMap[fieldKey] ?? []),
      item.field_label.toLowerCase(),
      fieldKey.replace(/_/g, ' ').toLowerCase(),
    ];

    const target = candidates.find((el) => {
      if (usedElements.has(el)) return false;
      const haystack = getAccessibleLabel(el);
      return keywords.some((kw) => kw.length >= 2 && haystack.includes(kw));
    });

    if (target) {
      const { verified, hadExisting } = setElementValue(target, item.value);
      usedElements.add(target);
      if (verified) {
        matchedFields.push(item.field_label);
        if (hadExisting) overwrittenFields.push(item.field_label);
        filledCount++;
      } else {
        failedCount++;
      }
    }
  }

  // Fallback: if DrChrono is using a single free-text clinical note box, inject the full narrative
  if (filledCount === 0 && candidates.length > 0) {
    const primaryNoteArea =
      candidates.find((el) => /note|soap|clinical|narrative|hpi/i.test(getAccessibleLabel(el))) ??
      candidates.find((el) => el instanceof HTMLTextAreaElement || el.isContentEditable);

    if (primaryNoteArea) {
      const { verified, hadExisting } = setElementValue(primaryNoteArea, payload.formatted_narrative);
      if (verified) {
        filledCount = 1;
        matchedFields.push('Clinical Note (Full Narrative)');
        if (hadExisting) overwrittenFields.push('Clinical Note (Full Narrative)');
      } else {
        failedCount++;
      }
    }
  }

  return {
    ok: filledCount > 0,
    filledCount,
    skippedCount: Math.max(0, payload.clinical_note_field_values.length - filledCount - failedCount),
    failedCount,
    matchedFields,
    overwrittenFields,
  };
}

chrome.runtime.onMessage.addListener((msg: IncomingMessage, _sender, sendResponse) => {
  if (msg.type === 'MEDSCRIBE_PING_DRCHRONO') {
    const editableCount = document.querySelectorAll(
      'textarea:not([disabled]), input[type="text"]:not([disabled]), [contenteditable="true"]',
    ).length;
    sendResponse({
      connected: true,
      url: window.location.href,
      editableCount,
    });
    return true;
  }

  if (msg.type === 'MEDSCRIBE_INJECT_DRCHRONO') {
    const result = injectIntoDrChronoDOM(msg.payload, msg.selectorMap);
    sendResponse(result);
    return true;
  }

  return false;
});
