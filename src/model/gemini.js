// The only module in the app that knows which model provider we use.
//
// It is the same idea as src/db.js: one file names the outside thing, everything
// above it talks to a small interface. Swapping Gemini for another provider, or for
// a model running on this machine, means rewriting this file and nothing else.
//
// The interface is one function: ask(prompt, schema) -> { data, usage } or null.
// `null` means "no answer this time", for any reason — no key, a timeout, a 429, a
// reply that was not the shape we asked for. The caller decides what to do about it,
// and in this app the caller always has a plan. See src/services/suggest.js.

import { config } from '../config.js';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

export const isConfigured = () => Boolean(config.model.apiKey);

export function createClient({ apiKey = config.model.apiKey, model = config.model.name, timeoutMs = config.model.timeoutMs } = {}) {
  return {
    name: model,
    async ask(prompt, schema) {
      if (!apiKey) return null;
      const started = Date.now();

      try {
        const res = await fetch(`${ENDPOINT}/${model}:generateContent`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              // Ask for JSON in a fixed shape. A model told to "answer in JSON" in
              // prose will eventually answer in prose; a schema makes the provider
              // enforce it, so our parsing is about a bug, not about luck.
              responseMimeType: 'application/json',
              responseSchema: schema,
              temperature: 0.2,
            },
          }),
          // Without this, a provider that never answers holds our request open until
          // the browser gives up. Eight seconds is longer than a good answer takes
          // and shorter than a user's patience.
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (!res.ok) return fail(started, res.status === 429 ? 'rate limited' : `HTTP ${res.status}`);

        const payload = await res.json();
        const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) return fail(started, 'no text in the reply');

        return {
          data: JSON.parse(text),
          usage: {
            ms: Date.now() - started,
            model,
            inputTokens: payload?.usageMetadata?.promptTokenCount ?? null,
            outputTokens: payload?.usageMetadata?.candidatesTokenCount ?? null,
          },
        };
      } catch (error) {
        // Timeout, DNS, TLS, malformed JSON: from here they are the same event.
        return fail(started, error.name === 'TimeoutError' ? 'timed out' : error.message);
      }
    },
  };
}

function fail(started, why) {
  // Deliberately not console.error: this is an expected outcome on a free tier,
  // not a fault. And deliberately not the prompt: that is somebody's own words.
  console.log(`model: no answer after ${Date.now() - started}ms (${why})`);
  return null;
}
