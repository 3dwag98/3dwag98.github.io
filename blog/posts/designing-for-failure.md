---
title: Designing for failure — cache-aside, breakers and the authorization hot path
date: 2026-08-02
tags: [distributed-systems, resilience, redis, spring-boot]
summary: What it actually takes to put a cache and a circuit breaker in front of an authorization check without turning a slow dependency into an outage.
---

Every authorization layer starts the same way: a synchronous call to the system of record,
on the hot path, on every request. It works beautifully until the system of record has a bad
afternoon — and then it is not one service that is degraded, it is everything sitting behind
the check.

The fix is not "add a cache". The fix is deciding, in advance and in writing, what the
service should do when the truth is unavailable.

## The shape of the problem

An authorization decision has three properties that make it awkward to cache:

| Property | Consequence |
| --- | --- |
| Read-heavy, write-rare | A cache pays for itself almost immediately |
| Correctness-sensitive | A stale *allow* is a security problem, a stale *deny* is a support ticket |
| On the hot path | Cache and fallback latency are both user-visible |

That table is the whole design conversation. The first row says cache it. The second says be
careful which direction you fail. The third says whatever you do must be fast.

## Cache-aside, and why not read-through

Cache-aside keeps the cache out of the write path, which means a cache outage degrades
latency instead of correctness:

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

Two details carry most of the weight here.

**The cache client must not throw.** A Redis timeout is a cache miss, not a request failure.
If your client library propagates exceptions, wrap it once, at the boundary, and treat every
error as `null`. Nothing downstream should know Redis exists.

**TTLs are asymmetric.** A stale *deny* is annoying; a stale *allow* is a finding. Short TTL
on the permissive answer, longer on the restrictive one, and an explicit invalidation hook on
policy writes.

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
        failureRateThreshold: 50
        waitDurationInOpenState: 20s
        slowCallDurationThreshold: 250ms
        slowCallRateThreshold: 60
```

`slowCallRateThreshold` matters more than most teams expect. Dependencies rarely fail
cleanly — they get slow first, and a breaker that only counts errors will happily let every
thread in the pool queue up behind a store that is technically still returning 200s.

## What happens when the breaker is open

This is the question the design doc has to answer out loud, because the code will answer it
either way:

- **Serve stale.** Keep a second, longer-lived copy of the last known decision and serve it
  with a header marking it as degraded. Right answer when the blast radius of a stale allow
  is bounded and auditable.
- **Fail closed.** Deny everything the cache cannot vouch for. Correct, and it converts a
  dependency outage into a full outage.
- **Fail open.** Only defensible for genuinely low-stakes resources, and only if someone
  senior signs the sentence "we will allow unauthorized reads of X during a policy store
  outage."

Pick per resource class, not once for the whole service. Writing it down in the design doc
is the part that actually prevents the 3 a.m. argument.

## Prove it before you ship it

A breaker you have never watched open is a config file, not a resilience strategy. Before
release, run the three cases deliberately:

```bash
# 1. dependency slow, not down
toxiproxy-cli toxic add policy-store -t latency -a latency=800

# 2. dependency down
toxiproxy-cli toxic add policy-store -t timeout -a timeout=0

# 3. cache down, dependency healthy
redis-cli -h cache-01 DEBUG sleep 30
```

Case three is the one that finds bugs. It is where you learn whether your "cache errors are
misses" wrapper is real or aspirational.

## And what the caller sees

One more thing, because it is the part that gets left to last and then designed by accident:
whatever the service decides, the screen has to say it. A degraded *allow* served from a stale
copy is a different state from a fresh one, and if the API returns both as a bare `200` then no
front end can ever tell the user which they got.

Put it in the response, not in a log line:

```json
{ "decision": "allow", "source": "cache", "degraded": true, "asOf": "2026-08-02T09:41:12Z" }
```

Now the UI has something to work with — a quiet marker rather than a spinner or a lie — and
support has an answer that does not require reading a dashboard. Failure semantics that stop at
the service boundary are only half specified.

## The short version

- Cache-aside, so a cache outage costs latency and not correctness.
- Asymmetric TTLs, because the two answers have different risk profiles.
- The breaker goes around the slow dependency, never around the cache.
- Count slow calls, not just failed ones.
- Decide the open-circuit behaviour per resource class, in writing, before an incident
  decides it for you.
- Say which answer you gave, all the way out to the screen.
