import { NextResponse } from 'next/server';
import { ociRequest } from '../../lib/oci-proxy';
import { createLogger } from '../../lib/logger';

export async function POST(request) {
  const requestId = crypto.randomUUID();
  const log = createLogger('generate-title-api', { requestId });

  try {
    const { userMessage } = await request.json();

    if (!userMessage) {
      return NextResponse.json({ error: 'userMessage is required' }, { status: 400 });
    }

    // Instructions go in a system message: OCI ignores `instructions` for gpt-oss.
    const requestBody = {
      model: 'openai.gpt-oss-120b',
      input: [
        {
          role: 'system',
          content: 'You write titles for chat conversations. Reply with ONLY the title for the user\'s message: 2-4 words, Title Case, typos fixed, no quotes, no punctuation, no explanation. Examples: "tell me a jok" -> Joke Request; "whats the wether" -> Weather Inquiry.',
        },
        { role: 'user', content: userMessage.substring(0, 300) },
      ],
      reasoning: { effort: 'low' },
      stream: false
    };

    const response = await ociRequest('POST', '/responses', { body: requestBody });

    if (!response.ok) {
      const errorText = await response.text();
      log.error('OCI API error', { status: response.status, error: errorText });
      return NextResponse.json({ error: 'Failed to generate title' }, { status: response.status });
    }

    const data = await response.json();
    log.debug('OCI title response', { data: JSON.stringify(data) });

    let rawText = '';
    if (typeof data.output === 'string') {
      rawText = data.output;
    } else if (Array.isArray(data.output)) {
      // Reasoning models put a `reasoning` item (which quotes the prompt) before
      // the `message` item: read the message.
      const textOutput = data.output.find(o => o.type === 'message') || data.output.find(o => o.type !== 'reasoning' && o.content);
      if (textOutput?.content) {
        if (Array.isArray(textOutput.content)) {
          const textContent = textOutput.content.find(c => c.type === 'output_text' || c.text);
          rawText = textContent?.text || textContent?.output_text || '';
        } else {
          rawText = textOutput.content;
        }
      }
    } else if (data.choices?.[0]?.message?.content) {
      rawText = data.choices[0].message.content;
    } else if (data.text) {
      rawText = data.text;
    }

    // The reply should be just the title: take its first non-empty line.
    let title = rawText.split('\n').map(l => l.trim()).find(Boolean) || '';

    // Clean up
    title = title.replace(/^[-*•#>\s]+/, '').trim();
    title = title.replace(/^["'“”*]+|["'“”*]+$/g, '').trim();
    title = title.replace(/[.!?:,]+$/, '').trim();

    // Remove reasoning prefixes
    title = title.replace(/^(thus|so|therefore|the title is|title|answer|output|result)[\s:]+/i, '').trim();

    // Limit to 5 words max
    const words = title.split(/\s+/);
    if (words.length > 5) {
      title = words.slice(0, 5).join(' ');
    }

    // Fallback if extraction failed
    if (!title || title.length < 2 || title.toLowerCase().includes('summarize') || title.toLowerCase().includes('message')) {
      const fallbackWords = userMessage.split(/\s+/).slice(0, 4);
      title = fallbackWords.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      title = title.replace(/[?!.,]+$/, '');
    }

    return NextResponse.json({ title });

  } catch (error) {
    log.error('Generate title error', { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
