import { NextResponse } from 'next/server';

// Suggested prompts shown under the input on an empty chat.
// Configured with EXAMPLE_QUERIES as a JSON array of strings, e.g.
//   EXAMPLE_QUERIES='["Categorize my agents","What problems can my agents solve?"]'

export const dynamic = 'force-dynamic';

function parseExampleQueries(raw) {
  const value = (raw || '').trim();
  if (!value) return [];
  try {
    const list = JSON.parse(value);
    if (Array.isArray(list)) {
      return list.filter(q => typeof q === 'string' && q.trim()).map(q => q.trim());
    }
    console.error('EXAMPLE_QUERIES must be a JSON array of strings.');
  } catch (e) {
    console.error('EXAMPLE_QUERIES is not valid JSON:', e.message);
  }
  return [];
}

export async function GET() {
  return NextResponse.json({ queries: parseExampleQueries(process.env.EXAMPLE_QUERIES) });
}
