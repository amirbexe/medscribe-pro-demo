import type { PEGScore } from '../types.js';

export function computePEGScore(
  painAverage: number | null,
  enjoymentInterference: number | null,
  generalActivityInterference: number | null,
): PEGScore {
  const valid = [painAverage, enjoymentInterference, generalActivityInterference].filter(
    (n): n is number => typeof n === 'number' && !Number.isNaN(n) && n >= 0 && n <= 10,
  );

  if (valid.length === 0) {
    return {
      painAverage,
      enjoymentInterference,
      generalActivityInterference,
      composite: null,
      severity: 'unscored',
    };
  }

  const composite = Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 10) / 10;
  let severity: PEGScore['severity'] = 'mild';
  if (composite >= 7) severity = 'severe';
  else if (composite >= 4) severity = 'moderate';

  return {
    painAverage,
    enjoymentInterference,
    generalActivityInterference,
    composite,
    severity,
  };
}

export function extractPEGFromText(text: string): PEGScore {
  const scoreToken = '(10(?:\\.0+)?|[0-9](?:\\.\\d+)?)(?![\\d.])';
  const painMatch =
    text.match(new RegExp(`(?:average|avg|typical|overall)\\s*pain[^0-9]{0,20}${scoreToken}\\s*(?:\\/\\s*10|out\\s*of\\s*10)?`, 'i')) ||
    text.match(new RegExp(`pain\\s*(?:is|at|around|about|score)?\\s*(?:a\\s*)?${scoreToken}\\s*(?:\\/\\s*10|out\\s*of\\s*10)`, 'i'));

  const enjoymentMatch = text.match(
    new RegExp(`enjoyment(?:\\s*of\\s*life)?[^0-9]{0,25}${scoreToken}\\s*(?:\\/\\s*10|out\\s*of\\s*10)?`, 'i'),
  );

  const activityMatch = text.match(
    new RegExp(`(?:general\\s*activity|daily\\s*activit(?:y|ies)|activity\\s*interference)[^0-9]{0,25}${scoreToken}\\s*(?:\\/\\s*10|out\\s*of\\s*10)?`, 'i'),
  );

  const p = painMatch ? Math.min(10, Math.max(0, parseFloat(painMatch[1]))) : null;
  const e = enjoymentMatch ? Math.min(10, Math.max(0, parseFloat(enjoymentMatch[1]))) : null;
  const g = activityMatch ? Math.min(10, Math.max(0, parseFloat(activityMatch[1]))) : null;

  return computePEGScore(p, e, g);
}
