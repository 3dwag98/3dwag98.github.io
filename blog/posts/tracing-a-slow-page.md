---
title: Where a slow page actually comes from
date: 2026-08-14
tags: [full-stack, performance, postgres, observability]
summary: A page that takes four seconds is rarely slow for the reason the first person to look at it thinks. How to find the real one, from the browser down to the query plan.
---

Someone says a page is slow. What happens next depends almost entirely on who they said it to.

Tell a frontend engineer and you get a bundle analysis. Tell a backend engineer and you get a
query plan. Tell an SRE and you get a dashboard of p99s. All three are looking at real numbers,
and all three can be looking at the wrong ones — because the four seconds the user experienced
almost never live in a single layer.

The only reliable way through is to walk the whole path once, in order, and refuse to guess.

## Start where the complaint started

Not with your monitoring. With the browser, on a real connection, doing the thing the person
described. Then read the timeline the platform already gives you for free:

```js
const nav = performance.getEntriesByType('navigation')[0];

console.table({
  dns:      nav.domainLookupEnd - nav.domainLookupStart,
  tcp:      nav.connectEnd      - nav.connectStart,
  ttfb:     nav.responseStart   - nav.requestStart,   // the server's share
  download: nav.responseEnd     - nav.responseStart,
  domReady: nav.domContentLoadedEventEnd - nav.responseEnd,
  load:     nav.loadEventEnd    - nav.responseEnd
});
```

This single table decides which half of the stack you are in.

**High TTFB, everything else small.** The server is the problem. Skip the rest of this section.

**Low TTFB, long `domReady`.** The server did its job and the browser is struggling — usually
render-blocking requests, a font that arrives late, or an effect that fires a second fetch after
hydration. Look at the resource waterfall before touching any backend code.

**Both small, page still feels slow.** Trust the person, not the numbers. You are measuring the
wrong navigation. Something after load — a lazy chunk, an unbatched list of requests, a layout
shift — is where the four seconds went.

That last case is the one I have most often watched a team miss, because every dashboard was
green.

## The waterfall question worth asking

In the browser, requests that *depend* on each other cost more than requests that are merely
numerous. One request that must finish before the next can start is worse than six in parallel,
even when the six move more bytes.

```js
// three round trips, strictly serial: the user waits for all of them
const me    = await fetch('/api/me').then(r => r.json());
const acct  = await fetch(`/api/accounts/${me.accountId}`).then(r => r.json());
const items = await fetch(`/api/accounts/${acct.id}/positions`).then(r => r.json());
```

Every `await` on a line whose result the next line needs is a full round trip you have chosen to
pay. Sometimes that is unavoidable. Often it means the API is shaped around the tables rather
than the screen — and the fix is an endpoint that answers the question the page is actually
asking, not three that each answer a third of it.

This is the seam I care most about, and it is invisible from either side alone. The frontend
sees three slow calls. The backend sees three fast ones.

## Then, and only then, the server

Once TTFB has been established as the culprit, the same discipline applies one layer down.
Instrument the phases rather than the endpoint:

```java
@Component
public class TimingFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest req,
                                    HttpServletResponse res,
                                    FilterChain chain) throws IOException, ServletException {
        long start = System.nanoTime();
        try {
            chain.doFilter(req, res);
        } finally {
            long ms = (System.nanoTime() - start) / 1_000_000;
            // one structured line per request beats a dashboard you have to interpret
            log.info("http_request path={} status={} ms={} db_ms={} cache={}",
                     req.getRequestURI(), res.getStatus(), ms,
                     RequestMetrics.dbMillis(), RequestMetrics.cacheOutcome());
        }
    }
}
```

`db_ms` next to total is the number that ends most arguments. If the request took 1,900 ms and
the database took 40, stop looking at the database.

## The query plan, read honestly

If the database *is* where the time went, do not reason about it. Ask:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT p.id, p.symbol, p.quantity
FROM positions p
WHERE p.account_id = $1
  AND p.closed_at IS NULL
ORDER BY p.updated_at DESC
LIMIT 50;
```

Two lines in that output matter more than the rest:

| What you see | What it means |
| --- | --- |
| `Seq Scan` on a large table | No usable index for this predicate |
| `rows=1` estimated, `rows=90000` actual | The planner is working from stale statistics |

The second is the one that bites, because the plan looks reasonable right up until the row
counts do not match. A plan chosen for one row and executed against ninety thousand is how a
query that was fine in staging takes four seconds in production.

## What I actually take away from these

Three things, every time:

- **The layer that reports the symptom is rarely the layer that caused it.** A slow page is a
  claim about the user's experience, not about your service.
- **Measure across the seam, not up to it.** Both sides can be individually fast and jointly
  terrible, and only someone willing to look at both will see it.
- **Write down what it turned out to be.** The next occurrence will look different enough to
  fool you, and similar enough that the note would have saved the afternoon.
