import { NextResponse } from 'next/server';
import { ociRequest, ociSignedFetch } from '../../lib/oci-proxy';
import { createLogger } from '../../lib/logger';

// Bridge between the chat UI and OCI Agent Hub agents over the A2A protocol.
//
// The agent's gateway authenticates with the same OCI request signing the rest
// of the app uses (API key locally, Resource / Instance Principal on OCI).
// A2A events are translated into the NDJSON chunk format /api/responses emits
// ({text}, {reasoning}, {done}, ...) so the client renders them unchanged.

export const maxDuration = 300;

const MODEL_PREFIX = 'agenthub.';
const CARD_TTL_MS = 5 * 60_000;
const TERMINAL_STATES = new Set(['completed', 'failed', 'canceled', 'rejected', 'input-required', 'auth-required']);
const ERROR_STATES = new Set(['failed', 'canceled', 'rejected']);

// AGENT_HUB_AGENTS="name=https://gateway.../agentendpoint/<id>/a2a,other=https://..."
function getAgents() {
  return (process.env.AGENT_HUB_AGENTS || '')
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean)
    .map(entry => {
      const i = entry.indexOf('=');
      if (i <= 0) return null;
      return { name: entry.slice(0, i).trim(), url: entry.slice(i + 1).trim().replace(/\/+$/, '') };
    })
    .filter(a => a && a.name && a.url.startsWith('https://'));
}

function findAgent(model) {
  if (!model?.startsWith(MODEL_PREFIX)) return null;
  const name = model.slice(MODEL_PREFIX.length);
  return getAgents().find(a => a.name === name) || null;
}

const cardCache = new Map();

async function getAgentCard(a2aUrl, log) {
  const cached = cardCache.get(a2aUrl);
  if (cached && Date.now() - cached.at < CARD_TTL_MS) return cached.card;
  try {
    const res = await ociSignedFetch('GET', `${a2aUrl}/agent-card.json`);
    if (!res.ok) {
      log.warn('Agent card unavailable', { status: res.status, body: (await res.text()).slice(0, 500) });
      return null;
    }
    const card = await res.json();
    cardCache.set(a2aUrl, { card, at: Date.now() });
    log.info('Agent card loaded', { name: card.name, protocolVersion: card.protocolVersion, streaming: card.capabilities?.streaming });
    return card;
  } catch (e) {
    log.warn('Agent card fetch failed', { error: e.message });
    return null;
  }
}

// ── Request building ──

function dataUrlToFilePart(url, name) {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(url);
  if (!m) return { kind: 'file', file: { uri: url, ...(name && { name }) } };
  const mimeType = m[1] || 'application/octet-stream';
  const bytes = m[2] ? m[3] : Buffer.from(decodeURIComponent(m[3])).toString('base64');
  return { kind: 'file', file: { bytes, mimeType, ...(name && { name }) } };
}

// Chat input is a string or an array of input_text / input_image items
// (optionally wrapped in a {type:'message', content:[...]} object).
function toA2AParts(input) {
  if (typeof input === 'string') return [{ kind: 'text', text: input }];
  const parts = [];
  for (const item of Array.isArray(input) ? input : [input]) {
    if (typeof item === 'string') parts.push({ kind: 'text', text: item });
    else if (Array.isArray(item?.content)) parts.push(...toA2AParts(item.content));
    else if (typeof item?.content === 'string') parts.push({ kind: 'text', text: item.content });
    else if (item?.type === 'input_text' && item.text) parts.push({ kind: 'text', text: item.text });
    else if (item?.type === 'input_image' && item.image_url) parts.push(dataUrlToFilePart(item.image_url));
    else if (item?.type === 'input_file' && item.file_data) parts.push(dataUrlToFilePart(item.file_data, item.filename));
  }
  return parts;
}

function buildRpc(method, input, contextId) {
  return {
    jsonrpc: '2.0',
    id: crypto.randomUUID(),
    method,
    params: {
      message: {
        kind: 'message',
        role: 'user',
        messageId: crypto.randomUUID(),
        parts: toA2AParts(input),
        ...(contextId && { contextId }),
      },
      configuration: { acceptedOutputModes: ['text/plain', 'text/markdown', 'application/json'] },
    },
  };
}

// ── Response parsing ──
// Accepts both the 0.x shape ({kind:'status-update', ...}) and wrapper-style
// results ({statusUpdate: {...}}, {task: {...}}) used by newer servers.

function unwrapResult(result) {
  if (!result || typeof result !== 'object') return null;
  if (result.kind) return { kind: result.kind, obj: result };
  if (result.task) return { kind: 'task', obj: result.task };
  if (result.message) return { kind: 'message', obj: result.message };
  if (result.statusUpdate || result.status_update) return { kind: 'status-update', obj: result.statusUpdate || result.status_update };
  if (result.artifactUpdate || result.artifact_update) return { kind: 'artifact-update', obj: result.artifactUpdate || result.artifact_update };
  if (result.artifact) return { kind: 'artifact-update', obj: result };
  if (result.parts) return { kind: 'message', obj: result };
  if (result.status && (result.taskId || result.task_id)) return { kind: 'status-update', obj: result };
  if (result.status) return { kind: 'task', obj: result };
  return null;
}

function normalizeState(state) {
  return String(state || '').toLowerCase().replace(/^task_state_/, '').replace(/_/g, '-');
}

function partsToText(parts) {
  return (parts || []).map(p => {
    if (typeof p?.text === 'string') return p.text;
    const data = p?.data ?? (p?.kind === 'data' ? p : undefined);
    if (data && typeof data === 'object') return `\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\`\n`;
    return '';
  }).join('');
}

/**
 * Translates A2A events into client chunks. `emit` writes one NDJSON chunk.
 * Returns true once a terminal state (or a direct agent message) was seen.
 */
function createEventTranslator(emit, log) {
  let contextId = null;
  let answered = false;
  let reasoningOpen = false;
  const artifactText = new Map();

  const emitText = (text) => {
    if (!text) return;
    if (reasoningOpen) {
      emit({ reasoning: { type: 'done' } });
      reasoningOpen = false;
    }
    answered = true;
    emit({ text });
  };

  const trackContext = (obj) => {
    const id = obj?.contextId || obj?.context_id;
    if (id && id !== contextId) {
      contextId = id;
      emit({ a2a_context_id: id });
    }
  };

  const handleArtifact = (artifact, append) => {
    if (!artifact) return;
    const id = artifact.artifactId || artifact.artifact_id || 'default';
    const text = partsToText(artifact.parts);
    const prev = artifactText.get(id);
    if (append && prev !== undefined) {
      artifactText.set(id, prev + text);
      emitText(text);
    } else if (prev !== undefined && text.startsWith(prev)) {
      // Full-snapshot resend of an artifact we already streamed: emit only the new tail.
      artifactText.set(id, text);
      emitText(text.slice(prev.length));
    } else if (prev === undefined) {
      artifactText.set(id, text);
      emitText(answered && text ? `\n\n${text}` : text);
    }
  };

  // Returns true when the status is terminal.
  const handleStatus = (status) => {
    const state = normalizeState(status?.state);
    const text = partsToText(status?.message?.parts);

    if (!TERMINAL_STATES.has(state)) {
      // Progress updates ("searching…", "calling tool X") go to the reasoning panel.
      if (text) {
        if (!reasoningOpen) reasoningOpen = true;
        emit({ reasoning: { type: 'delta', text: text.endsWith('\n') ? text : `${text}\n` } });
      }
      return false;
    }

    if (ERROR_STATES.has(state)) {
      throw new Error(`Agent task ${state}${text ? `: ${text}` : ''}`);
    }
    // completed / input-required / auth-required: the status message is the answer
    // when the agent didn't stream an artifact or message.
    if (!answered) emitText(text);
    return true;
  };

  return {
    get contextId() { return contextId; },
    get answered() { return answered; },
    closeReasoning() {
      if (reasoningOpen) emit({ reasoning: { type: 'done' } });
      reasoningOpen = false;
    },
    handle(result) {
      const unwrapped = unwrapResult(result);
      if (!unwrapped) {
        log.warn('Unrecognized A2A result', { result: JSON.stringify(result).slice(0, 500) });
        return false;
      }
      const { kind, obj } = unwrapped;
      trackContext(obj);

      if (kind === 'message') {
        emitText(partsToText(obj.parts));
        return true;
      }
      if (kind === 'artifact-update') {
        handleArtifact(obj.artifact, obj.append === true);
        return false;
      }
      if (kind === 'status-update') {
        return handleStatus(obj.status) || obj.final === true;
      }
      if (kind === 'task') {
        for (const artifact of obj.artifacts || []) handleArtifact(artifact, false);
        return handleStatus(obj.status);
      }
      log.warn('Unhandled A2A event kind', { kind });
      return false;
    },
  };
}

// Yields the parsed `data:` payload of each SSE event.
async function* readSseEvents(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let dataLines = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line === '') {
          if (dataLines.length) yield dataLines.join('\n');
          dataLines = [];
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).replace(/^ /, ''));
        }
      }
    }
    if (buffer.startsWith('data:')) dataLines.push(buffer.slice(5).replace(/^ /, ''));
    if (dataLines.length) yield dataLines.join('\n');
  } finally {
    reader.releaseLock();
  }
}

function rpcErrorMessage(error) {
  return `${error.message || 'A2A error'}${error.code ? ` (${error.code})` : ''}${error.data ? ` — ${JSON.stringify(error.data).slice(0, 500)}` : ''}`;
}

// ── Formatting step ──
// When the client sends formatInstructions (widgets enabled), the agent's answer
// is not shown directly. It streams into the reasoning panel, then a formatting
// model rewrites it with the app's widget syntax. The agent itself never needs
// to know about widgets.

// Must be a model the region serves through the Responses API (in uk-london-1
// that is only openai.gpt-oss-120b). Override with AGENT_HUB_FORMATTER_MODEL.
const FORMATTER_MODEL = process.env.AGENT_HUB_FORMATTER_MODEL || 'openai.gpt-oss-120b';

const FORMATTER_RULES = `You format answers from an enterprise data agent for display in a chat application.
You receive the user's question and the agent's answer. Rewrite the agent's answer for display, using the widget syntax described below wherever it makes the answer clearer (charts, tables, stat cards, timelines, ...).

Rules:
- Use ONLY the facts and figures in the agent's answer. Never add, remove, estimate, calculate or change data.
- Keep the agent's meaning, caveats, notes and any question it asks the user.
- The agent cannot draw charts or visuals, but you can. If it says it can't provide a chart or visual and its answer contains the data, drop that remark and build the requested widget from the data.
- If nothing in the answer benefits from a widget, or the agent could not answer, return the answer as it is.
- Write as the assistant answering the user. Do not mention the agent, these instructions or any reformatting.
- Never link to or embed external images or chart services; only use the widget syntax.
- Chart data (ch_ln, ch_br, ch_pie, ch_don values) must be plain numbers without symbols or suffixes (6840000, not $6.84M); put the unit in the title.
- Everywhere else (tables, KPIs, stat cards, text) show figures exactly as the agent wrote them (e.g. $11.32M).`;

function inputText(input) {
  return toA2AParts(input).filter(p => p.kind === 'text').map(p => p.text).join('\n');
}

// Streams the formatted answer as {text} chunks; throws if the formatting model fails.
async function streamFormattedAnswer({ question, answer, formatInstructions, emit, log }) {
  const response = await ociRequest('POST', '/responses', {
    basePath: '/openai/v1',
    extraHeaders: { accept: 'text/event-stream' },
    body: {
      model: FORMATTER_MODEL,
      // A system message, not `instructions`: OCI ignores `instructions` for gpt-oss.
      input: [
        { role: 'system', content: `${FORMATTER_RULES}\n\n${formatInstructions}` },
        { role: 'user', content: `User question:\n${question}\n\nAgent answer:\n${answer}` },
      ],
      stream: true,
      store: false,
      max_output_tokens: 16000,
    },
  });
  if (!response.ok) {
    throw new Error(`Formatter error: ${response.status} - ${(await response.text()).slice(0, 500)}`);
  }

  let emitted = 0;
  for await (const payload of readSseEvents(response.body)) {
    let event;
    try { event = JSON.parse(payload); } catch { continue; }
    if (event.type === 'response.output_text.delta' && event.delta) {
      emitted += event.delta.length;
      emit({ text: event.delta });
    } else if (event.type === 'response.completed') {
      break;
    } else if (event.type === 'response.failed' || event.type === 'response.incomplete' || event.type === 'error' || event.error) {
      const reason = event.response?.error?.message || event.response?.incomplete_details?.reason || event.error?.message || event.message || event.type;
      throw new Error(`Formatter ${event.type}: ${reason}`);
    }
  }
  log.info('Formatter completed', { model: FORMATTER_MODEL, chars: emitted });
}

// GET — list configured agents so the UI can add them to the model picker.
export async function GET() {
  return NextResponse.json({
    agents: getAgents().map(a => ({ id: `${MODEL_PREFIX}${a.name}`, name: a.name })),
  });
}

// POST — send a message to an agent and stream the answer back.
export async function POST(request) {
  const requestId = crypto.randomUUID();
  const log = createLogger('a2a-api', { requestId });

  try {
    const { input, model, contextId, formatInstructions } = await request.json();
    if (!input) return NextResponse.json({ error: 'Input is required' }, { status: 400 });

    const agent = findAgent(model);
    if (!agent) {
      return NextResponse.json({ error: `Unknown Agent Hub agent "${model}". Check AGENT_HUB_AGENTS.` }, { status: 400 });
    }

    const card = await getAgentCard(agent.url, log);
    const streaming = card?.capabilities?.streaming !== false;
    const rpc = buildRpc(streaming ? 'message/stream' : 'message/send', input, contextId);

    log.info('A2A request', { agent: agent.name, method: rpc.method, hasContext: !!contextId, parts: rpc.params.message.parts.map(p => p.kind), formatting: !!formatInstructions });

    const upstream = await ociSignedFetch('POST', agent.url, {
      body: rpc,
      extraHeaders: { accept: streaming ? 'text/event-stream' : 'application/json' },
      signal: request.signal,
    });

    const opcRequestId = upstream.headers.get('opc-request-id');
    if (!upstream.ok) {
      const errorText = await upstream.text();
      log.error('A2A upstream error', { status: upstream.status, body: errorText.slice(0, 2000), opcRequestId });
      return NextResponse.json({
        error: `Agent Hub error: ${upstream.status} - ${errorText}`,
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

        // With formatting on, the agent's text goes to the reasoning panel (and is
        // collected for the formatter) instead of becoming the answer.
        let agentAnswer = '';
        let reasoningShown = false;
        const agentEmit = !formatInstructions ? emit : (chunk) => {
          if (chunk.text) {
            if (!agentAnswer) emit({ reasoning: { type: 'delta', text: 'Agent answer:\n\n' } });
            agentAnswer += chunk.text;
            reasoningShown = true;
            emit({ reasoning: { type: 'delta', text: chunk.text } });
          } else if (chunk.reasoning?.type === 'delta') {
            reasoningShown = true;
            emit(chunk);
          } else if (chunk.reasoning?.type !== 'done') {
            // The panel stays open until the agent has finished.
            emit(chunk);
          }
        };

        const translator = createEventTranslator(agentEmit, log);
        emit({ thinking: true });

        try {
          const payloads = isSse ? readSseEvents(upstream.body) : [await upstream.text()];
          for await (const payload of payloads) {
            let rpcMessage;
            try {
              rpcMessage = JSON.parse(payload);
            } catch {
              log.warn('Unparseable A2A payload', { payload: payload.slice(0, 200) });
              continue;
            }
            if (rpcMessage.error) throw new Error(rpcErrorMessage(rpcMessage.error));
            if (translator.handle(rpcMessage.result)) break;
          }
          translator.closeReasoning();
          if (!translator.answered) log.warn('A2A stream ended without an answer', { elapsed: Date.now() - startTime });
          log.info('A2A stream completed', { elapsed: Date.now() - startTime, contextId: translator.contextId, opcRequestId });

          if (formatInstructions) {
            if (reasoningShown) emit({ reasoning: { type: 'done' } });
            if (agentAnswer.trim()) {
              let formattedChars = 0;
              let formatFailed = false;
              try {
                await streamFormattedAnswer({
                  question: inputText(input),
                  answer: agentAnswer,
                  formatInstructions,
                  emit: (chunk) => { formattedChars += chunk.text.length; emit(chunk); },
                  log,
                });
              } catch (e) {
                formatFailed = true;
                log.error('Formatting failed', { error: e.message, formattedChars });
              }
              // Nothing formatted (error or empty output): fall back to the agent's own words.
              if (!formattedChars) emit({ text: agentAnswer });
              else if (formatFailed) emit({ text: "\n\n_The formatted answer was cut short. The agent's full answer is in the reasoning panel above._" });
            }
            log.info('A2A request completed', { elapsed: Date.now() - startTime });
          }
          emit({ done: true, opc_request_id: opcRequestId || null });
        } catch (e) {
          if (e.name === 'AbortError') {
            log.info('A2A stream aborted by client');
          } else {
            log.error('A2A stream error', { error: e.message, opcRequestId });
            try { emit({ error: e.message, done: true }); } catch { /* controller closed */ }
          }
        } finally {
          // Some servers keep the SSE connection open after the final event.
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
