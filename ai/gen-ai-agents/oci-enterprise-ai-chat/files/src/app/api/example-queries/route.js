import { NextResponse } from 'next/server';

// Suggested prompts shown under the input on an empty chat.
// EXAMPLE_QUERIES is either a JSON array of strings, shown for every model:
//   EXAMPLE_QUERIES='["Categorize my agents","What problems can my agents solve?"]'
// or a JSON object of lists per model, keyed by agent name or model id, with an
// optional "default" list for models that have no entry:
//   EXAMPLE_QUERIES='{"AdaHR":["What is our headcount by region?"],"xai.grok-4.7":["Summarise this file"],"default":["What can you do?"]}'

export const dynamic = 'force-dynamic';

const cleanList = (list) =>
  Array.isArray(list) ? list.filter(q => typeof q === 'string' && q.trim()).map(q => q.trim()) : [];

// Returns {byModel: {key: [...]}, default: [...]}
function parseExampleQueries(raw) {
  const empty = { byModel: {}, default: [] };
  const value = (raw || '').trim();
  if (!value) return empty;
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return { byModel: {}, default: cleanList(parsed) };
    if (parsed && typeof parsed === 'object') {
      const { default: fallback, ...rest } = parsed;
      const byModel = Object.fromEntries(
        Object.entries(rest).map(([key, list]) => [key.trim(), cleanList(list)])
      );
      return { byModel, default: cleanList(fallback) };
    }
    console.error('EXAMPLE_QUERIES must be a JSON array of strings or an object of arrays per model.');
  } catch (e) {
    console.error('EXAMPLE_QUERIES is not valid JSON:', e.message);
  }
  return empty;
}

export async function GET() {
  return NextResponse.json(parseExampleQueries(process.env.EXAMPLE_QUERIES));
}
