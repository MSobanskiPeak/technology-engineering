import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { ociSignedFetch } from '../../lib/oci-proxy';
import { createLogger } from '../../lib/logger';
import { findAgent, readSseEvents } from '../../lib/agent-hub';
import { createAgentOutput } from '../../lib/agent-formatter';

// Talks to an OCI Agent Hub agent through its deployment's /chat endpoint, so the
// agent can be used from the chat UI like a model. The agent only receives the
// user's message; with widgets enabled, its answer is turned into widgets by the
// formatting step (lib/agent-formatter.js).
//
// What the endpoint does (found by testing, not documented):
// - Accepts Responses-style input: {input: [{type:'message', role, content:[{type:'input_text'|'output_text', text}]}]}
// - Ignores `instructions` and system/developer messages — the agent's own prompt wins.
// - Keeps a session per `x-session-id` request header (a `sessionId` body field is
//   ignored). Any UUID works and the first call creates the session, so the
//   agent remembers earlier turns and keeps its MCP connections. Without the
//   header every call starts a new session.
// - Streams events that are all typed `response.created`, each carrying one text
//   fragment in response.output[].content[] (status IN_PROGRESS), then a final
//   event with the full text (status COMPLETED), then `[DONE]`.

export const maxDuration = 300;

// Plain text of a chat input (string, or an array of input_text / input_image items).
// Images are not sent: the agent endpoint only accepts text.
function inputToText(input) {
  if (typeof input === 'string') return input;
  return (Array.isArray(input) ? input : [input])
    .map(item => {
      if (typeof item === 'string') return item;
      if (Array.isArray(item?.content)) return inputToText(item.content);
      if (typeof item?.content === 'string') return item.content;
      if (item?.type === 'input_text' || item?.type === 'output_text' || item?.type === 'text') return item.text || '';
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function textMessage(role, text) {
  return {
    type: 'message',
    role,
    content: [{ type: role === 'assistant' ? 'output_text' : 'input_text', text }],
  };
}

// One agent session per chat + agent, derived from their ids so it needs no
// storage and survives page reloads (UUID-shaped, as the gateway expects).
function agentSessionId(conversationId, agentName) {
  if (!conversationId) return null;
  const h = createHash('sha256').update(`${conversationId}:${agentName}`).digest('hex');
  const variant = (8 | (parseInt(h[16], 16) & 3)).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function outputText(response) {
  return (response?.output || [])
    .filter(o => o.type === 'message')
    .flatMap(o => o.content || [])
    .filter(c => c.type === 'output_text' && typeof c.text === 'string')
    .map(c => c.text)
    .join('');
}

function errorMessage(event) {
  const error = event?.error || event?.response?.error;
  if (error?.code || (error?.message && event?.status === 'failed')) {
    return `${error.message || 'Agent error'}${error.code ? ` (${error.code})` : ''}`;
  }
  if (event?.detail) return String(event.detail);
  return null;
}

// GET is served by /api/a2a (agent list); this route only handles chat.
export async function POST(request) {
  const requestId = crypto.randomUUID();
  const log = createLogger('agent-chat-api', { requestId });

  try {
    const { input, model, conversationId, formatInstructions } = await request.json();
    const userText = inputToText(input);
    if (!userText) return NextResponse.json({ error: 'Input is required' }, { status: 400 });

    const agent = findAgent(model);
    if (!agent) {
      return NextResponse.json({ error: `Unknown Agent Hub agent "${model}". Check AGENT_HUB_AGENTS.` }, { status: 400 });
    }

    // The agent's session holds the earlier turns, so only the new message is sent.
    const sessionId = agentSessionId(conversationId, agent.name);
    const body = {
      stream: true,
      input: [textMessage('user', userText)],
    };

    log.info('Agent chat request', {
      agent: agent.name,
      sessionId,
      formatting: !!formatInstructions,
      droppedImages: Array.isArray(input) && input.some(i => i?.type === 'input_image'),
    });

    const upstream = await ociSignedFetch('POST', agent.chatUrl, {
      body,
      extraHeaders: {
        accept: 'text/event-stream',
        ...(sessionId && { 'x-session-id': sessionId }),
      },
      signal: request.signal,
    });

    const opcRequestId = upstream.headers.get('opc-request-id');
    if (!upstream.ok) {
      const errorText = await upstream.text();
      log.error('Agent chat upstream error', { status: upstream.status, body: errorText.slice(0, 2000), opcRequestId });
      let detail = errorText;
      try { detail = errorMessage(JSON.parse(errorText)) || errorText; } catch { /* not JSON */ }
      return NextResponse.json({
        error: `Agent Hub error: ${upstream.status} - ${detail}`,
        opc_request_id: opcRequestId,
        model,
        timestamp: new Date().toISOString(),
      }, { status: upstream.status });
    }

    const encoder = new TextEncoder();
    const isSse = (upstream.headers.get('content-type') || '').includes('text/event-stream');

    const stream = new ReadableStream({
      async start(controller) {
        const emit = (chunk) => controller.enqueue(encoder.encode(JSON.stringify(chunk) + '\n'));
        const startTime = Date.now();
        // With formatting on, the agent's text goes to the reasoning panel and the
        // formatter's output becomes the answer.
        const output = createAgentOutput({ emit, formatInstructions, log });
        let streamed = '';
        const emitText = (text) => {
          if (!text) return;
          streamed += text;
          output.emit({ text });
        };
        // The final event repeats the whole answer: emit only what wasn't streamed yet.
        const emitFinal = (full) => {
          if (full.startsWith(streamed)) emitText(full.slice(streamed.length));
          else if (!streamed) emitText(full);
          else log.warn('Final answer differs from streamed text', { streamedLen: streamed.length, finalLen: full.length });
        };

        emit({ thinking: true });

        try {
          const payloads = isSse ? readSseEvents(upstream.body) : [await upstream.text()];
          for await (const payload of payloads) {
            if (payload.trim() === '[DONE]') break;
            let event;
            try {
              event = JSON.parse(payload);
            } catch {
              log.warn('Unparseable agent event', { payload: payload.slice(0, 200) });
              continue;
            }

            const error = errorMessage(event);
            if (error) throw new Error(error);

            // Standard Responses streaming events, in case the endpoint switches to them.
            if (event.type === 'response.output_text.delta') {
              emitText(event.delta);
              continue;
            }
            if (event.type === 'response.completed') {
              emitFinal(outputText(event.response));
              break;
            }

            // Agent Hub format: every event carries a response snapshot.
            const response = event.response || (event.object === 'response' ? event : null);
            if (!response) continue;
            const status = String(response.output?.[0]?.status || response.status || '').toUpperCase();
            const text = outputText(response);
            if (status === 'FAILED' || status === 'INCOMPLETE') {
              throw new Error(`Agent response ${status.toLowerCase()}${text ? `: ${text}` : ''}`);
            }
            if (status === 'COMPLETED' || !isSse) {
              emitFinal(text);
              break;
            }
            emitText(text);
          }

          if (!streamed) log.warn('Agent stream ended without an answer', { elapsed: Date.now() - startTime });
          log.info('Agent chat completed', { elapsed: Date.now() - startTime, chars: streamed.length, opcRequestId });
          await output.finish(userText);
          if (formatInstructions) log.info('Agent chat request completed', { elapsed: Date.now() - startTime });
          emit({ done: true, opc_request_id: opcRequestId || null });
        } catch (e) {
          if (e.name === 'AbortError') {
            log.info('Agent chat aborted by client');
          } else {
            log.error('Agent chat stream error', { error: e.message, opcRequestId });
            try { emit({ error: e.message, done: true }); } catch { /* controller closed */ }
          }
        } finally {
          upstream.body?.cancel().catch(() => {});
          try { controller.close(); } catch { /* already closed */ }
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    log.error('Unhandled error', { error: error.message, stack: error.stack });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
