/**
 * Shared helpers for OCI Agent Hub agents (used by /api/a2a and /api/agent-chat).
 *
 * Agents are configured with AGENT_HUB_AGENTS as comma-separated name=URL pairs,
 * where URL is the deployment's "A2A endpoint URL":
 *   AGENT_HUB_AGENTS="name=https://gateway.../agentendpoint/<id>/a2a,other=https://..."
 * The deployment's chat endpoint is the same URL with /chat instead of /a2a.
 */

export const MODEL_PREFIX = 'agenthub.';

export function getAgents() {
  return (process.env.AGENT_HUB_AGENTS || '')
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean)
    .map(entry => {
      const i = entry.indexOf('=');
      if (i <= 0) return null;
      const url = entry.slice(i + 1).trim().replace(/\/+$/, '');
      return {
        name: entry.slice(0, i).trim(),
        url,
        chatUrl: `${url.replace(/\/a2a$/, '')}/chat`,
      };
    })
    .filter(a => a && a.name && a.url.startsWith('https://'));
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
