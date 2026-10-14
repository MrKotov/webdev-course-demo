# What the agent cost

One row per agent session, priced at the provider's **list price** on the date in the
first column, even though the free tier charged nothing. A free session priced honestly
is the only way to learn what the same work costs a team that pays for it.

Where a tool reports credits instead of tokens, the credits go in their own column and
the cost is whatever that tool's published rate makes them.

| Date | Tool | Input tokens | Output tokens | Credits (if no tokens) | List-price cost | What it was for |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-09-19 | Gemini CLI | 41 200 | 6 800 | | $0.21 | Slices 1 and 2 from the spec |
| 2026-09-20 | Gemini CLI | 88 500 | 9 100 | | $0.42 | The day view, and the tests it needed |
| 2026-09-22 | Gemini CLI | 126 900 | 14 300 | | $0.64 | Sign in with Google, twice: the first attempt used a library and was thrown away |
| 2026-09-23 | Gemini CLI | 74 600 | 11 500 | | $0.41 | The suggestion feature and its guard |
| 2026-09-23 | Gemini CLI | 95 300 | 8 900 | | $0.45 | The MCP tools over the services, after the first attempt wrote its own SQL |
| 2026-09-24 | Gemini CLI | 143 800 | 17 200 | | $0.78 | The front end: tokens, four states, keyboard path |

**Total so far: about $2.91 at list price, $0.00 actually charged.**

Two things worth reading off this table rather than being told:

1. The two most expensive sessions are the two where the agent's first answer was wrong
   in a way that needed the work redone: Google sign-in and the MCP tools. Neither
   failure was a bug; both were the agent solving the problem as stated while ignoring
   a constraint that lived in `AGENTS.md`. The fix was cheaper than the re-run.
2. Output tokens are roughly a tenth of input by count and a much larger share of the
   cost, because output is priced several times higher. The way to spend less is almost
   never to ask for shorter answers; it is to send less context.

The free tier does not report cache hits, so every figure here is an upper bound. Saying
so is more useful than a confident number nobody can check.
