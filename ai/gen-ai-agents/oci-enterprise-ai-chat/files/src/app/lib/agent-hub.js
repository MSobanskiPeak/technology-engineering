/**
 * Shared helpers for OCI Agent Hub agents (used by /api/a2a and /api/agent-chat).
 *
 * Agents are configured with AGENT_HUB_AGENTS (see parseAgentConfig). Each one
 * appears in the model picker as "agenthub.<name>".
 */

export const MODEL_PREFIX = 'agenthub.';

// AGENT_HUB_AGENTS is a JSON array:
//   [{"name":"finance","url":"https://gateway.../agentendpoint/<id>/a2a"}, ...]
// The URL can be the deployment's A2A or chat endpoint (or its base); both
// endpoints are derived from it.
function parseAgentConfig(raw) {
  const value = (raw || '').trim();
  if (!value) return [];
  try {
    const list = JSON.parse(value);
    if (Array.isArray(list)) return list;
    console.error('AGENT_HUB_AGENTS must be a JSON array of {"name", "url"} objects.');
  } catch (e) {
    console.error('AGENT_HUB_AGENTS is not valid JSON:', e.message);
  }
  return [];
}

export function getAgents() {
  const seen = new Set();
  return parseAgentConfig(process.env.AGENT_HUB_AGENTS)
    .filter(a => typeof a?.name === 'string' && typeof a?.url === 'string')
    .map(a => {
      const base = a.url.trim().replace(/\/+$/, '').replace(/\/(a2a|chat)$/, '');
      return { name: a.name.trim(), url: `${base}/a2a`, chatUrl: `${base}/chat` };
    })
    // Names become model ids ("agenthub.<name>"), so they must be unique.
    .filter(a => a.name && a.url.startsWith('https://') && !seen.has(a.name) && seen.add(a.name));
}

export function findAgent(model) {
  if (!model?.startsWith(MODEL_PREFIX)) return null;
  const name = model.slice(MODEL_PREFIX.length);
  return getAgents().find(a => a.name === name) || null;
}

// Yields the `data:` payload of each SSE event.
export async function* readSseEvents(body) {
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
