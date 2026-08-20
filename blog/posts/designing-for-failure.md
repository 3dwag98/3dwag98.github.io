---
title: Designing for failure — failure modes, degradation and what resilience costs
date: 2026-08-02
tags: [distributed-systems, resilience, redis, spring-boot]
summary: Failure is not one thing, and neither is the answer to it. A working method for deciding what a service does when the truth is unavailable — worked through the authorization hot path, and honest about what each mechanism costs.
---

Every authorization layer starts the same way: a synchronous call to the system of record,
on the hot path, on every request. It works beautifully until the system of record has a bad
afternoon — and then it is not one service that is degraded, it is everything sitting behind
the check.

The fix is not "add a cache". The fix is deciding, in advance and in writing, what the
service should do when the truth is unavailable.

That sentence is the whole discipline, and most of the difficulty is that it hides four
separate questions inside it. What does *unavailable* actually look like? What are the
answers you are willing to give instead? Which one applies to which request? And what is
each of those answers costing you when nothing is wrong at all?

## Failure is not one thing

The word "down" does a lot of damage. It suggests a binary that operations dashboards are
happy to reinforce — a green tick or a red cross — and it trains people to build for the one
failure mode that is easiest to detect and rarest in practice.

| Mode | What it looks like | What catches it |
| --- | --- | --- |
| **Crash** | Connection refused, immediately | Anything. This is the easy one |
| **Slow** | Correct answers, eventually | Latency budgets, not health checks |
| **Wrong** | Confident answers that are false | Invariants and reconciliation, not monitoring |
| **Partial** | One shard, one region, one tenant | Per-dimension metrics; aggregates hide it |
| **Correlated** | Everything at once, same cause | Nothing, at the time. Design, beforehand |

A crash is a gift. It is fast, unambiguous, and every client library already handles it. The
mode that takes services down is the second one — the dependency that is technically up,
returning `200`s, and taking eight hundred milliseconds to do it. Health checks pass. Error
rates are flat. And every thread in your pool is parked waiting on it.

This is the failure that the literature calls **grey** — the system's own view of its health
disagrees with the view its callers have. It matters because almost every default in almost
every library is tuned for crashes. A circuit breaker that counts errors will never open on a
dependency that is merely slow. A load balancer that health-checks with `GET /health` will
keep sending traffic to the slowest node in the pool, because that node is perfectly capable
of returning two hundred bytes of JSON while its actual work queue is thirty seconds deep.

**"Is it up?" is the wrong question. "Is it useful, within the time I have?" is the right
one.** Everything below follows from taking the second question seriously.

## The shape of the problem

An authorization decision has three properties that make it awkward, and they are worth
naming before reaching for any mechanism:

| Property | Consequence |
| --- | --- |
| Read-heavy, write-rare | A cache pays for itself almost immediately |
| Correctness-sensitive | A stale *allow* is a security problem, a stale *deny* is a support ticket |
| On the hot path | Cache and fallback latency are both user-visible |

That table is the design conversation. The first row says cache it. The second says be
careful *which direction* you fail. The third says whatever you do must be fast — including
the failing.

The second row is the one that generalises. Almost every resilience decision reduces to
choosing which kind of wrongness you can live with, and the answer is rarely symmetric.
Serving a stale price is different from serving a stale permission. Dropping a metric is
different from dropping a payment. Teams that skip this step end up with one policy for the
whole service, which means the policy was chosen by whichever resource was easiest to reason
about.

## Every remote call needs four numbers

Before any of the named patterns, there is a checklist. A call across a network that does not
have all four of these has an undefined failure mode, and undefined means "whatever the
library felt like".

<figure class="diagram">
<svg viewBox="0 0 800 210" role="img" aria-label="One call from a caller to a policy store, passing through a bulkhead that bounds concurrency, a cache that answers most calls, and a circuit breaker that bounds failure, with a timeout on the call itself.">
  <text class="d-cap" x="5" y="18">ONE CALL — FOUR PLACES TO STOP IT</text>
  <rect class="d-box" x="5" y="46" width="130" height="50"/>
  <text class="d-key" x="70" y="76" text-anchor="middle">CALLER</text>
  <path class="d-rule" d="M135 71 L162 71"/>
  <path class="d-fill-rule" d="M162 66 L170 71 L162 76 Z"/>
  <rect class="d-box" x="170" y="46" width="130" height="50"/>
  <text class="d-key" x="235" y="76" text-anchor="middle">BULKHEAD</text>
  <text class="d-cap" x="235" y="118" text-anchor="middle">BOUNDS CONCURRENCY</text>
  <path class="d-rule" d="M300 71 L327 71"/>
  <path class="d-fill-rule" d="M327 66 L335 71 L327 76 Z"/>
  <rect class="d-box" x="335" y="46" width="130" height="50"/>
  <text class="d-key" x="400" y="76" text-anchor="middle">CACHE</text>
  <text class="d-cap" x="400" y="118" text-anchor="middle">ANSWERS MOST CALLS</text>
  <path class="d-rule" d="M465 71 L492 71"/>
  <path class="d-fill-rule" d="M492 66 L500 71 L492 76 Z"/>
  <rect class="d-box" x="500" y="46" width="130" height="50"/>
  <text class="d-key" x="565" y="76" text-anchor="middle">BREAKER</text>
  <text class="d-cap" x="565" y="118" text-anchor="middle">BOUNDS FAILURE</text>
  <path class="d-accent-line" d="M630 71 L657 71"/>
  <path class="d-accent-fill" d="M657 66 L665 71 L657 76 Z"/>
  <text class="d-accent-cap" x="647" y="36" text-anchor="middle">250ms</text>
  <rect class="d-accent-box" x="665" y="46" width="130" height="50"/>
  <text class="d-key" x="730" y="76" text-anchor="middle">STORE</text>
  <text class="d-cap" x="730" y="118" text-anchor="middle">THE SLOW ONE</text>
  <path class="d-rule" d="M5 152 L795 152"/>
  <text class="d-cap" x="5" y="176">EACH GATE ANSWERS ONE QUESTION — WHAT DO WE SERVE INSTEAD?</text>
  <text class="d-cap" x="5" y="196">A GATE WITHOUT AN ANSWER IS JUST A DIFFERENT WAY TO FAIL</text>
</svg>
</figure>

**A timeout.** The most common resilience bug in production is not a missing circuit breaker;
it is a client with no read timeout, or with a connect timeout and no read timeout, which is
the same bug wearing a hat. Pick the number from the dependency's observed p99 plus headroom,
not from a round number that felt safe. And set it *lower* than your own caller's budget:
timeouts have to shrink down a call chain, or an upstream gives up while three services
downstream are still diligently working on a request nobody is waiting for. That work is not
free — it is holding connections, threads and locks on behalf of a dead request.

**A retry policy, including "none".** Retry only what is idempotent and only what is worth
retrying: a timeout, maybe; a `429`, after the delay it asked for; a `400`, never. Then bound
it. Three attempts against a dependency at a 50% error rate triples your offered load at
exactly the moment it can least afford it, and if every caller does the same thing the system
can settle into a state where the retries are the load — it stays down after the original
trigger is gone, because it is now feeding itself. Exponential backoff **with jitter**, and a
retry budget that caps retries at a small fraction of live traffic, are what stop that.

**A concurrency limit.** A bulkhead is not exotic; it is a bounded pool per dependency so that
one slow thing cannot consume every thread in the process. Without it, the slow dependency
does not degrade its own feature — it degrades every feature, because they were all sharing a
connection pool.

**A fallback.** What is served when the first three give up. This is the one that gets left
blank, and leaving it blank does not mean "no fallback" — it means the fallback is a stack
trace and a `500`.

## Cache-aside, and why not read-through

With the checklist in place, the mechanisms have somewhere to sit. Cache-aside keeps the
cache out of the write path, which means a cache outage degrades latency instead of
correctness:

```java
public Decision authorize(Principal principal, Resource resource) {
    String key = key(principal, resource);

    Decision cached = cache.get(key);          // never throws — see below
    if (cached != null) {
        return cached;
    }

    Decision fresh = policyStore.evaluate(principal, resource);
    cache.put(key, fresh, ttlFor(fresh));      // short TTL on allow, longer on deny
    return fresh;
}
```

Three details carry most of the weight.

**The cache client must not throw.** A Redis timeout is a cache miss, not a request failure.
If your client library propagates exceptions, wrap it once, at the boundary, and treat every
error as `null`. Nothing downstream should know Redis exists. This is the single line that
decides whether a cache is a performance optimisation or a new single point of failure, and
it is astonishing how often it is left to a library default.

**TTLs are asymmetric.** A stale *deny* is annoying; a stale *allow* is a finding. Short TTL
on the permissive answer, longer on the restrictive one, and an explicit invalidation hook on
policy writes. The asymmetry is the whole point — a single `cacheTtl` property in a config
file is a decision not to think about it.

**Expiry is a thundering herd waiting to happen.** A hot key with a fixed TTL expires for
every caller at the same instant, and a thousand threads discover the miss together and all
go to the store. You need one of: single-flight, so concurrent misses on the same key
collapse into one load — Caffeine's `get(key, loader)` does this per key, which is a good
reason to keep a small local tier in front of Redis — or jittered TTLs so the expiries spread,
or probabilistic early refresh so one unlucky caller renews before the deadline. Pick one
deliberately. The failure mode of picking none is that your cache converts a steady load into
a periodic spike aimed at the dependency you were protecting.

## The breaker goes around the store, not the cache

A common mistake is putting the circuit breaker around the whole `authorize` method. Then a
degraded policy store opens the breaker and takes the *cache* down with it, exactly when the
cache is the only thing still working.

The breaker belongs around the dependency:

```java
Decision fresh = breaker.executeSupplier(
        () -> policyStore.evaluate(principal, resource));
```

with the fallback stated explicitly rather than inherited from whatever the library does by
default:

```yaml
resilience4j:
  circuitbreaker:
    instances:
      policyStore:
        slidingWindowSize: 60
        minimumNumberOfCalls: 20
        failureRateThreshold: 50
        waitDurationInOpenState: 20s
        permittedNumberOfCallsInHalfOpenState: 5
        slowCallDurationThreshold: 250ms
        slowCallRateThreshold: 60
  bulkhead:
    instances:
      policyStore:
        maxConcurrentCalls: 32
        maxWaitDuration: 0
```

`slowCallRateThreshold` matters more than most teams expect, and it is the direct answer to
the grey failure above. Dependencies rarely fail cleanly — they get slow first, and a breaker
that only counts errors will happily let every thread in the pool queue up behind a store
that is technically still returning `200`s.

`minimumNumberOfCalls` is the other one worth setting by hand. Without it, a breaker on a
low-traffic path will trip on two failures out of three and stay open for twenty seconds on
what was, statistically, nothing at all.

And be clear about what a breaker is *for*. It does not make a failing dependency work. It
stops you from spending your own capacity discovering that it does not — it converts a slow
failure into a fast one, so the thread comes back and the fallback runs. If you have no
fallback, a breaker only makes you fail faster, which is worth something, but much less than
people expect when they add one.

## Degrading on purpose

This is the question the design doc has to answer out loud, because the code will answer it
either way. Degradation is not what happens when the design runs out; it is a set of states
you chose, ordered, with the cost of each one written next to it.

<figure class="diagram">
<svg viewBox="0 0 800 300" role="img" aria-label="Five degradation states from fresh to refuse, each with what the caller gets and what the state costs.">
  <text class="d-cap" x="40" y="22">STATE</text>
  <text class="d-cap" x="250" y="22">WHAT THE CALLER GETS</text>
  <text class="d-cap" x="540" y="22">WHAT IT COSTS</text>
  <path class="d-rule" d="M5 34 L795 34"/>
  <path class="d-accent-line" d="M16 56 L16 262"/>
  <rect class="d-accent-fill" x="10" y="50" width="12" height="12"/>
  <text class="d-key" x="40" y="61">FRESH</text>
  <text class="d-cap" x="250" y="61">THE TRUTH, NOW</text>
  <text class="d-cap" x="540" y="61">THE DEPENDENCY BEING UP</text>
  <rect class="d-accent-fill" x="10" y="100" width="12" height="12"/>
  <text class="d-key" x="40" y="111">STALE</text>
  <text class="d-cap" x="250" y="111">LAST KNOWN GOOD, MARKED</text>
  <text class="d-cap" x="540" y="111">A BOUNDED WINDOW OF WRONG</text>
  <rect class="d-accent-fill" x="10" y="150" width="12" height="12"/>
  <text class="d-key" x="40" y="161">REDUCED</text>
  <text class="d-cap" x="250" y="161">A COARSER ANSWER, STILL TRUE</text>
  <text class="d-cap" x="540" y="161">FUNCTION, NOT CORRECTNESS</text>
  <rect class="d-accent-fill" x="10" y="200" width="12" height="12"/>
  <text class="d-key" x="40" y="211">STATIC</text>
  <text class="d-cap" x="250" y="211">A FIXED SAFE DEFAULT</text>
  <text class="d-cap" x="540" y="211">EVERYTHING PERSONAL</text>
  <rect class="d-accent-fill" x="10" y="250" width="12" height="12"/>
  <text class="d-key" x="40" y="261">REFUSE</text>
  <text class="d-cap" x="250" y="261">AN HONEST ERROR, FAST</text>
  <text class="d-cap" x="540" y="261">THE REQUEST</text>
  <path class="d-rule" d="M5 278 L795 278"/>
  <text class="d-cap" x="5" y="296">CHOSEN PER RESOURCE CLASS — NOT ONCE FOR THE WHOLE SERVICE</text>
</svg>
</figure>

For the authorization case, the middle of that ladder resolves to three real options:

- **Serve stale.** Keep a second, longer-lived copy of the last known decision and serve it
  with a header marking it as degraded. Right answer when the blast radius of a stale allow
  is bounded and auditable.
- **Fail closed.** Deny everything the cache cannot vouch for. Correct, and it converts a
  dependency outage into a full outage.
- **Fail open.** Only defensible for genuinely low-stakes resources, and only if someone
  senior signs the sentence "we will allow unauthorized reads of X during a policy store
  outage."

Pick per resource class, not once for the whole service. A read of a public product listing
and a transfer of money do not deserve the same answer, and a service that gives them the
same answer has quietly decided that one of them is wrong.

Two rules make the ladder work in practice. **Every rung must be reachable in normal
operation** — a fallback path exercised only during incidents is a path that has never been
tested, and untested code has an outage in it. Route a small slice of live traffic down each
rung on purpose. And **the ladder must be able to go back up**: a service that degrades and
stays degraded because nothing re-tests the dependency has not degraded gracefully, it has
just broken slowly. That is what the breaker's half-open state is for, and why
`permittedNumberOfCallsInHalfOpenState` deserves a considered value rather than a default.

## Load shedding is degradation too

There is a failure mode that none of the above touches: the dependency is fine, and there is
simply more work arriving than you can do. Queueing is what turns that into an outage.

The intuition is Little's law — the number of requests in flight is the arrival rate times
how long each one takes. When service time rises and arrivals do not fall, the number in
flight rises to match, and every one of those is holding memory, a connection and a slot. The
queue is not a buffer at that point; it is a place where latency is manufactured. Requests at
the back of it will time out on the client before you get to them, so the work you eventually
do is work nobody is waiting for any more.

The answer is to refuse work early, cheaply, and on purpose:

- **Bound every queue.** An unbounded queue is a decision to fail later and worse.
- **Shed at the edge**, before the request has consumed anything expensive.
- **Shed by priority, not arrival order.** Health checks and interactive traffic outrank
  batch and prefetch. If you have not classified your traffic, the shed is random.
- **Return the refusal quickly and say it is a refusal** — a `503` with `Retry-After` is
  information; a timeout is a guess.

Shedding feels like giving up. It is the opposite: it is the mechanism that keeps the service
answering *someone* instead of failing everyone slowly.

## Say which answer you gave

Whatever the service decides, the screen has to say it. A degraded *allow* served from a stale
copy is a different state from a fresh one, and if the API returns both as a bare `200` then no
front end can ever tell the user which they got.

Put it in the response, not in a log line:

```json
{ "decision": "allow", "source": "cache", "degraded": true, "asOf": "2026-08-02T09:41:12Z" }
```

Now the UI has something to work with — a quiet marker rather than a spinner or a lie — and
support has an answer that does not require reading a dashboard. Failure semantics that stop
at the service boundary are only half specified.

It also gives you the metric that actually matters. Error rate goes to zero the moment you
add a good fallback, which feels like success and is in fact the graph going blind: the
service is now wrong quietly instead of loudly. **The number to alert on is the rate of
degraded serves**, per rung of the ladder. A service running 4% stale is telling you
something long before it starts returning errors.

## What resilience costs

None of this is free, and pretending otherwise is how teams end up with a service whose
resilience machinery is the least reliable thing in it. Every mechanism above buys something
specific, charges for it continuously, and has its own way of going wrong:

| Mechanism | Buys you | Charges you | How it fails |
| --- | --- | --- | --- |
| **Timeout** | A bounded wait | Work discarded that might have finished | Too tight, and you fail calls that were about to succeed |
| **Retry** | Recovery from a blip | Multiplied load, duplicated effects | A storm, at exactly the wrong moment |
| **Breaker** | Not queueing behind a corpse | A window where good calls are refused | Bad thresholds trip on a healthy dependency |
| **Bulkhead** | One dependency cannot take the process | Idle capacity reserved per pool | Sized too small, it becomes the bottleneck |
| **Cache** | Latency, and something to fall back to | Staleness, and invalidation forever | A stampede on expiry, or a stale allow |
| **Shedding** | The service keeps answering someone | Headroom you must pay for and not use | Shedding the requests that mattered |

Three costs are worth spelling out because they are the ones that do not appear on any
dashboard.

**Complexity is a real budget.** Every fallback is a second code path, and it is always the
less-tested one. A service with five degradation states has five behaviours to reason about,
document, and keep true as the code changes. That is affordable for an authorization hot path
that everything else sits behind. It is not automatically affordable for an internal admin
screen, and adding it there is not caution — it is cost with no matching risk.

**Somebody has to own the correctness trade.** "Serve stale for up to ninety seconds" is not
an engineering decision made in a pull request; it is a statement about acceptable wrongness,
and it belongs to whoever owns the consequence. The engineering job is to make the trade
explicit, bounded and reversible — not to make it quietly.

**A fallback can be worse than the failure.** If the dependency is more reliable than the
mechanism protecting it, the mechanism is now the risk. This is not hypothetical: a breaker
with a threshold nobody revisited, a cache holding a decision nobody can invalidate, a retry
policy that turns a ten-second blip into a forty-minute recovery. Before adding a mechanism,
it is worth asking what its own failure looks like, and whether you would notice.

The honest test for all of it: **what does this do on a normal Tuesday?** If the answer is
"nothing, it just sits there", you have bought insurance. If the answer is "adds a hop, holds
a pool, and occasionally trips", you are paying a premium every day for a policy you should
be able to justify.

## Prove it before you ship it

A breaker you have never watched open is a config file, not a resilience strategy. Before
release, run the cases deliberately:

```bash
# 1. dependency slow, not down — the grey failure, and the one that matters
toxiproxy-cli toxic add policy-store -t latency -a latency=800

# 2. dependency down
toxiproxy-cli toxic add policy-store -t timeout -a timeout=0

# 3. cache down, dependency healthy
redis-cli -h cache-01 DEBUG sleep 30

# 4. both, which is not the same as either
toxiproxy-cli toxic add policy-store -t latency -a latency=800 && \
  redis-cli -h cache-01 DEBUG sleep 30
```

Case three is the one that finds bugs. It is where you learn whether your "cache errors are
misses" wrapper is real or aspirational. Case four is the one teams skip, and it is where
correlated failure lives — the cache and the store often share a network, a region or a
deploy, so "both at once" is not a paranoid scenario, it is Tuesday afternoon.

Assert on the behaviour, not the absence of a crash. "It stayed up" is not a result. The
result is a sentence with numbers in it: *under an 800 ms dependency, the breaker opened
within N seconds, p99 stayed under M ms, and 100% of responses carried `degraded: true`.*
Write that down, then make it a test that runs before every release, because thresholds rot —
the p99 you tuned against last quarter's dependency is not this quarter's.

## The short version

- Failure is not binary. The mode that takes services down is *slow*, not *dead*, and almost
  every default is tuned for *dead*.
- Every remote call needs four numbers: a timeout, a retry policy, a concurrency limit and a
  fallback. Blank is not "none", it is "undefined".
- Timeouts shrink down a call chain, or upstream gives up while downstream keeps working for
  nobody.
- Cache-aside, so a cache outage costs latency and not correctness — and the cache client
  must never throw.
- Asymmetric TTLs, because the two answers have different risk profiles.
- The breaker goes around the slow dependency, never around the cache. Count slow calls, not
  just failed ones.
- Decide the degraded behaviour per resource class, in writing, before an incident decides it
  for you — and make sure the ladder can climb back up.
- Shed early and by priority. An unbounded queue is a decision to fail later and worse.
- Say which answer you gave, all the way out to the screen, and alert on the rate of degraded
  serves rather than errors.
- Every mechanism has a running cost and its own failure mode. If it does nothing on a normal
  Tuesday, it is insurance. If it does something, justify it.
