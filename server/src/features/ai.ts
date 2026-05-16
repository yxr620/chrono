import { register as registerRoute } from '../shared/router.js';
import { findUserById } from '../auth/users.js';
import { config } from '../config.js';
import { forbidden, internal } from '../shared/errors.js';

registerRoute('POST', /^\/v1\/chat\/completions$/, true, async (_req, body, userId) => {
  const user = await findUserById(userId!);
  const allowed = config.allowedAiEmails
    .map(s => s.toLowerCase())
    .includes(user.email.toLowerCase());
  if (!allowed) throw forbidden('ai_not_enabled');

  if (!config.ai.apiKey) throw internal('ai_not_configured');

  // Force the upstream model server-side; ignore client model field if present.
  const upstreamBody = {
    ...body,
    model: config.ai.model,
  };

  const upstreamUrl = `${config.ai.baseURL.replace(/\/$/, '')}/chat/completions`;

  const upstream = await fetch(upstreamUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.ai.apiKey}`,
    },
    body: JSON.stringify(upstreamBody),
  });

  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => '');
    throw internal(`upstream_${upstream.status}`, errText.slice(0, 500));
  }

  if (!upstream.body) {
    throw internal('upstream_no_body');
  }

  return {
    __raw: true,
    status: upstream.status,
    contentType: upstream.headers.get('content-type') ?? 'text/event-stream',
    stream: upstream.body,  // ReadableStream<Uint8Array> — relays SSE chunks 1:1
  };
});
