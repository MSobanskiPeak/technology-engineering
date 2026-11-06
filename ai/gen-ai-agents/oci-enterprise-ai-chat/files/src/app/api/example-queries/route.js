import { NextResponse } from 'next/server';

// Suggested prompts shown under the input on an empty chat.
// EXAMPLE_QUERIES is either a JSON array of strings, shown for every model:
//   EXAMPLE_QUERIES='["Categorize my agents","What problems can my agents solve?"]'
// or a JSON object of lists per model, keyed by agent name or model id, with an
// optional "default" list for models that have no entry:
//   EXAMPLE_QUERIES='{"AdaHR":["What is our headcount by region?"],"xai.grok-4.7":["Summarise this file"],"default":["What can you do?"]}'
//
// Welcome section shown above the input on an empty chat, as Markdown.
// WELCOME_MESSAGES takes the same keys, with a string for each model:
//   WELCOME_MESSAGES='{"AdaHR":"Welcome to **AdaHR**.\n\nAsk about headcount and leave.","default":"What can I help with?"}'

export const dynamic = 'force-dynamic';

const cleanList = (list) =>
  Array.isArray(list) ? list.filter(q => typeof q === 'string' && q.trim()).map(q => q.trim()) : [];

const cleanText = (text) => (typeof text === 'string' ? text.trim() : '');

// Returns {byModel: {key: value}, default: value}
function parseByModel(name, raw, clean) {
  const empty = { byModel: {}, default: clean() };
  const value = (raw || '').trim();
  if (!value) return empty;
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed) || typeof parsed === 'string') return { byModel: {}, default: clean(parsed) };
    if (parsed && typeof parsed === 'object') {
      const { default: fallback, ...rest } = parsed;
      const byModel = Object.fromEntries(
        Object.entries(rest).map(([key, entry]) => [key.trim(), clean(entry)])
      );
      return { byModel, default: clean(fallback) };
    }
    console.error(`${name} must be a JSON value or an object of values per model.`);
  } catch (e) {
    console.error(`${name} is not valid JSON:`, e.message);
  }
  return empty;
}

export async function GET() {
  return NextResponse.json({
    ...parseByModel('EXAMPLE_QUERIES', process.env.EXAMPLE_QUERIES, cleanList),
    welcome: parseByModel('WELCOME_MESSAGES', process.env.WELCOME_MESSAGES, cleanText),
  });
}
