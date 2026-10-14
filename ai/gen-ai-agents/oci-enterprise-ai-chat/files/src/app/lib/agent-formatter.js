/**
 * Formatting step for Agent Hub answers (used by /api/agent-chat and /api/a2a).
 *
 * The agent answers in plain text and never sees the app's widget prompts. When
 * the client sends formatInstructions (widgets enabled), the agent's answer goes
 * to the reasoning panel, then a formatting model rewrites it with the widget
 * syntax and that becomes the answer. If formatting fails, the agent's own
 * answer is shown.
 */

import { ociRequest } from './oci-proxy';
import { readSseEvents } from './agent-hub';

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
      // Formatting needs little thinking: low effort halves the time (~0.9s vs ~2.1s
      // for gpt-oss-120b) with the same widget quality.
      reasoning: { effort: 'low' },
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

// Agent progress lines ("...Initialising session") are not part of the answer:
// they become status updates shown as the reasoning chip's label.
const STATUS_PREFIX = '...';

/**
 * Wraps a route's chunk emitter.
 * - Agent progress lines starting with "..." become {reasoning: {type: 'status'}}.
 * - Without formatInstructions, the rest of the agent's text is the answer.
 * - With them, it is collected and shown in the reasoning panel, and finish()
 *   streams the formatted answer.
 */
export function createAgentOutput({ emit, formatInstructions, log }) {
  let agentAnswer = '';   // the agent's answer, without progress lines
  let panelOpen = false;  // a reasoning item is open in the UI
  let pending = '';       // start of a line that may still turn out to be a progress line
  let midLine = false;    // the current line is already known to be answer text

  const closePanel = () => {
    if (panelOpen) emit({ reasoning: { type: 'done' } });
    panelOpen = false;
  };

  const emitStatus = (line) => {
    const text = line.trim().slice(STATUS_PREFIX.length).trim();
    if (!text) return;
    panelOpen = true;
    emit({ reasoning: { type: 'status', text } });
  };

  const emitAnswerText = (text) => {
    if (!text || (!agentAnswer && !text.trim())) return; // skip blank lines before the answer
    if (formatInstructions) {
      if (!agentAnswer) emit({ reasoning: { type: 'delta', text: 'Agent answer:\n\n' } });
      panelOpen = true;
      emit({ reasoning: { type: 'delta', text } });
    } else {
      closePanel(); // progress is over once the answer is being written
      emit({ text });
    }
    agentAnswer += text;
  };

  const processLine = (line) => (line.trim().startsWith(STATUS_PREFIX) ? emitStatus(line) : emitAnswerText(line));

  // Text arrives in arbitrary pieces. A line is held back only while it could
  // still be a progress line (it is empty so far, or starts with ".").
  const handleText = (text) => {
    let rest = text;
    while (rest) {
      const nl = rest.indexOf('\n');
      const piece = nl === -1 ? rest : rest.slice(0, nl + 1);
      rest = nl === -1 ? '' : rest.slice(nl + 1);
      if (midLine) {
        emitAnswerText(piece);
      } else {
        pending += piece;
        const start = pending.trimStart();
        if (nl !== -1) {
          processLine(pending);
          pending = '';
        } else if (!start.startsWith(STATUS_PREFIX) && !STATUS_PREFIX.startsWith(start)) {
          emitAnswerText(pending);
          pending = '';
          midLine = true;
        }
      }
      if (nl !== -1) midLine = false;
    }
  };

  return {
    emit(chunk) {
      if (chunk.text) return handleText(chunk.text);
      if (chunk.reasoning?.type === 'delta') {
        // A2A progress updates arrive as reasoning text.
        if ((chunk.reasoning.text || '').trim().startsWith(STATUS_PREFIX)) return emitStatus(chunk.reasoning.text);
        panelOpen = true;
        return emit(chunk);
      }
      if (chunk.reasoning?.type === 'done') {
        // With formatting, the panel stays open until the agent has finished.
        if (!formatInstructions) closePanel();
        return;
      }
      emit(chunk);
    },

    // Call once the agent has finished answering.
    async finish(question) {
      if (pending) processLine(pending);
      pending = '';
      closePanel();
      if (!formatInstructions || !agentAnswer.trim()) return;

      const startTime = Date.now();
      let formattedChars = 0;
      let failed = false;
      try {
        await streamFormattedAnswer({
          question,
          answer: agentAnswer,
          formatInstructions,
          emit: (chunk) => { formattedChars += chunk.text.length; emit(chunk); },
          log,
        });
      } catch (e) {
        failed = true;
        log.error('Formatting failed', { error: e.message, formattedChars });
      }
      // Nothing formatted (error or empty output): fall back to the agent's own words.
      if (!formattedChars) emit({ text: agentAnswer });
      else if (failed) emit({ text: "\n\n_The formatted answer was cut short. The agent's full answer is in the reasoning panel above._" });
      log.info('Formatting step done', { elapsed: Date.now() - startTime, formattedChars, failed });
    },
  };
}
