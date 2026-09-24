-- Sign in with a provider, alongside the password.
--
-- One person, one row in `users`. A provider account is an extra *identity* attached
-- to that user, not a second account: that is why this is its own table with a foreign
-- key, and not two more columns on `users`. Add GitHub tomorrow and nothing here changes.
--
-- `subject` is the provider's own permanent id for the person ("sub" in an OpenID token).
-- We match on it rather than on the e-mail address, because a person can change their
-- e-mail at Google and still be the same account. The e-mail is stored only so the
-- readiness report and the lecturer can see which address was linked.

CREATE TABLE identities (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider   TEXT NOT NULL,
  subject    TEXT NOT NULL,
  email      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (provider, subject)
);

CREATE INDEX identities_user ON identities (user_id);

-- An account created by a provider has no password. The column is NOT NULL, so it
-- gets a value that no hash can ever equal: verifyPassword splits on '$' and wants
-- three parts starting with 'scrypt', and this is one part. Signing in with a
-- password is then impossible for that account until the person sets one, which is
-- the behaviour we want and is easier to prove than a nullable column.
