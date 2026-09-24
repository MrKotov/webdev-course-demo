-- Every call to the model provider, so the cost and the latency are facts rather
-- than impressions. The readiness report and lecture 10's arithmetic both read this.
--
-- Note what is NOT here: the prompt. It contains what a user typed, and a log is the
-- easiest place in a system to leak personal data from. We keep the shape of the call
-- (how long, how many tokens, did it work) and throw the content away.

CREATE TABLE model_calls (
  id            INTEGER PRIMARY KEY,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  model         TEXT NOT NULL,
  ms            INTEGER NOT NULL,
  input_tokens  INTEGER,
  output_tokens INTEGER,
  outcome       TEXT NOT NULL CHECK (outcome IN ('ok', 'fallback', 'error'))
);

CREATE INDEX model_calls_created ON model_calls (created_at);
