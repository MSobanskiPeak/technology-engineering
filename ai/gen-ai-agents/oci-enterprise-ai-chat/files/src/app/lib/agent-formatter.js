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

/**
 * Wraps a route's chunk emitter. Without formatInstructions, chunks pass straight
 * through. With them, the agent's text is collected and shown in the reasoning
 * panel, and finish() streams the formatted answer.
 */
export function createAgentOutput({ emit, formatInstructions, log }) {
  let agentAnswer = '';
  let panelOpen = false;

  return {
    emit(chunk) {
      if (!formatInstructions) return emit(chunk);
      if (chunk.text) {
        if (!agentAnswer) emit({ reasoning: { type: 'delta', text: 'Agent answer:\n\n' } });
        agentAnswer += chunk.text;
        panelOpen = true;
        emit({ reasoning: { type: 'delta', text: chunk.text } });
      } else if (chunk.reasoning?.type === 'delta') {
        panelOpen = true;
        emit(chunk);
      } else if (chunk.reasoning?.type !== 'done') {
        // The panel stays open until the agent has finished.
        emit(chunk);
      }
    },

    // Call once the agent has finished answering.
    async finish(question) {
      if (!formatInstructions) return;
      if (panelOpen) emit({ reasoning: { type: 'done' } });
      if (!agentAnswer.trim()) return;

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
