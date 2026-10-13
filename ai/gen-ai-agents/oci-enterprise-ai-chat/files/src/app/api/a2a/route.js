import { NextResponse } from 'next/server';
import { ociSignedFetch } from '../../lib/oci-proxy';
import { createLogger } from '../../lib/logger';
import { MODEL_PREFIX, getAgents, findAgent, readSseEvents } from '../../lib/agent-hub';

// Bridge between the chat UI and OCI Agent Hub agents over the A2A protocol.
//
// The agent's gateway authenticates with the same OCI request signing the rest
// of the app uses (API key locally, Resource / Instance Principal on OCI).
// A2A events are translated into the NDJSON chunk format /api/responses emits
// ({text}, {reasoning}, {done}, ...) so the client renders them unchanged.

export const maxDuration = 300;

const CARD_TTL_MS = 5 * 60_000;
const TERMINAL_STATES = new Set(['completed', 'failed', 'canceled', 'rejected', 'input-required', 'auth-required']);
const ERROR_STATES = new Set(['failed', 'canceled', 'rejected']);

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

function rpcErrorMessage(error) {
  return `${error.message || 'A2A error'}${error.code ? ` (${error.code})` : ''}${error.data ? ` — ${JSON.stringify(error.data).slice(0, 500)}` : ''}`;
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
    const { input, model, contextId } = await request.json();
    if (!input) return NextResponse.json({ error: 'Input is required' }, { status: 400 });

    const agent = findAgent(model);
    if (!agent) {
      return NextResponse.json({ error: `Unknown Agent Hub agent "${model}". Check AGENT_HUB_AGENTS.` }, { status: 400 });
    }

    const card = await getAgentCard(agent.url, log);
    const streaming = card?.capabilities?.streaming !== false;
    const rpc = buildRpc(streaming ? 'message/stream' : 'message/send', input, contextId);

    log.info('A2A request', { agent: agent.name, method: rpc.method, hasContext: !!contextId, parts: rpc.params.message.parts.map(p => p.kind) });

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
        const translator = createEventTranslator(emit, log);
        const startTime = Date.now();
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
