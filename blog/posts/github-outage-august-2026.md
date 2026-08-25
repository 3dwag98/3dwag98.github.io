---
title: Seven hours of GitHub — why fixing the cause did not end the outage
date: 2026-08-25
tags: [incident-review, distributed-systems, kubernetes, git]
summary: On 17 August 2026 GitHub was degraded for 7h 47m. One misconfigured autoscaling rule started it; retry logic — GitHub's own, plus a latent bug in VS Code — kept it going for four and a half hours after the cause was fixed. Every component and term explained from the ground up, then set against why Git is unusually hard to host at all.
---

The published root cause of the 17 August 2026 GitHub outage is four words long: *network saturation on
load balancers*. That is true, and on its own it explains almost nothing. Saturation is a symptom. The
interesting question is why a platform with regional failover, autoscaling and a service mesh stayed
broken for **seven hours and forty-seven minutes** — four and a half of them *after* the thing that
caused the saturation had been dealt with.

That gap is the whole lesson. Most outages you will be paged for have two separate causes: the thing
that knocked the system over, and the thing that kept it on the floor. They are usually not the same,
and fixing the first does not fix the second.

This post walks the whole chain. I have assumed you know what an HTTP request is and roughly what
Kubernetes does, and not much beyond that — every component, acronym and mechanism gets defined where
it first appears. The second half asks the follow-up question, *why is hosting Git this hard in the
first place*, using Cursor's engineering write-up on running Git at scale as the reference.

## The one-paragraph version

A traffic spike hit a service whose autoscaler was watching the wrong number, so it did not scale. The
network proxy inside each of its pods filled up. That backed up into four shared load balancers, which
ran out of connection slots. Those load balancers sat in front of authentication, and authentication
sits in front of everything, so Issues, Pull Requests, Actions, Pages, Webhooks and Copilot all started
failing at once. Clients — including a buggy retry path in VS Code — responded by retrying hard enough
to multiply traffic tenfold, which kept the system down long after the original spike was handled.
Recovery came from *removing* load, not adding capacity: pausing the load balancers, then rejecting
token requests outright, then ramping traffic back slowly.

## The cast: what each of these components actually is

Postmortems assume you already know the architecture. Here is the request path, simplified, with the
three places this incident went wrong marked in the order they failed.

<figure class="diagram">
<svg viewBox="0 0 800 300" role="img" aria-label="A simplified request path: client, then HAProxy load balancer, then the Istio sidecar and the app inside one pod, with all three calling a shared gateway auth path. Numbered markers show the failure order: sidecar first, then HAProxy, then auth.">
  <text class="d-cap" x="0" y="14">ONE REQUEST, END TO END &#183; SIMPLIFIED</text>
  <text class="d-cap" x="700" y="28">ONE POD</text>
  <rect class="d-ghost" x="400" y="34" width="400" height="76"/>
  <rect class="d-box" x="0" y="42" width="180" height="60"/>
  <text class="d-key" x="16" y="70">YOUR CLIENT</text>
  <text class="d-cap" x="16" y="90">BROWSER &#183; GIT &#183; VS CODE</text>
  <rect class="d-box" x="206" y="42" width="180" height="60"/>
  <text class="d-key" x="222" y="70">HAPROXY</text>
  <text class="d-cap" x="222" y="90">LOAD BALANCER</text>
  <rect class="d-box" x="412" y="42" width="180" height="60"/>
  <text class="d-key" x="428" y="70">SIDECAR</text>
  <text class="d-cap" x="428" y="90">ISTIO / ENVOY PROXY</text>
  <rect class="d-box" x="618" y="42" width="180" height="60"/>
  <text class="d-key" x="634" y="70">THE APP</text>
  <text class="d-cap" x="634" y="90">ISSUES &#183; PRS &#183; ACTIONS</text>
  <path class="d-accent-line d-flow" d="M180 72 L200 72"/>
  <path class="d-accent-fill" d="M206 72 l-10 -5 l0 10 z"/>
  <path class="d-accent-line d-flow d-d1" d="M386 72 L406 72"/>
  <path class="d-accent-fill" d="M412 72 l-10 -5 l0 10 z"/>
  <path class="d-accent-line d-flow d-d2" d="M592 72 L612 72"/>
  <path class="d-accent-fill" d="M618 72 l-10 -5 l0 10 z"/>
  <circle class="d-accent-fill d-blink" cx="421" cy="24" r="9"/>
  <text class="d-on-accent" x="417" y="28">1</text>
  <circle class="d-accent-fill d-blink d-d2" cx="215" cy="24" r="9"/>
  <text class="d-on-accent" x="211" y="28">2</text>
  <path class="d-accent-line d-flow-slow" d="M296 102 L296 152"/>
  <path class="d-accent-fill" d="M296 158 l5 -10 l-10 0 z"/>
  <path class="d-accent-line d-flow-slow d-d1" d="M502 102 L502 152"/>
  <path class="d-accent-fill" d="M502 158 l5 -10 l-10 0 z"/>
  <path class="d-accent-line d-flow-slow d-d2" d="M708 102 L708 152"/>
  <path class="d-accent-fill" d="M708 158 l5 -10 l-10 0 z"/>
  <rect class="d-accent-box" x="180" y="164" width="560" height="52"/>
  <text class="d-key" x="200" y="188">GATEWAY AUTH PATH</text>
  <text class="d-accent-cap" x="200" y="206">EVERY REQUEST NEEDS A VALID TOKEN &#8212; SO EVERY SERVICE WAITS HERE</text>
  <circle class="d-accent-fill d-blink d-d4" cx="160" cy="190" r="9"/>
  <text class="d-on-accent" x="156" y="194">3</text>
  <path class="d-rule" d="M0 246 L800 246"/>
  <text class="d-cap" x="0" y="268">FAILURE ORDER: THE SIDECAR FILLS UP, HAPROXY RUNS OUT OF FLOW SLOTS,</text>
  <text class="d-cap" x="0" y="288">AND THE SHARED AUTH PATH TAKES EVERY OTHER SERVICE DOWN WITH IT.</text>
</svg>
</figure>

**Your client** is a browser tab, a `git push`, a CI runner, or an editor like VS Code asking for a
Copilot token. From GitHub's side these are all just inbound HTTP.

**HAProxy** is a load balancer — a process whose job is to accept incoming connections and hand each
one to a healthy backend server. It is *shared*: many different services sit behind the same HAProxy
nodes. The relevant limit here is the **flow limit**: the maximum number of connections it will track
at once. Every in-flight request occupies one slot until it completes. That number is finite and
configured in advance. Remember this — it is the hinge of the entire incident.

**Istio** is a *service mesh*. The idea: instead of every service implementing retries, TLS, timeouts,
routing and metrics itself, you inject a small proxy next to each copy of the service and let the proxy
do it. That proxy is called a **sidecar** — a second container running inside the same Kubernetes pod
as your application container, sharing its network namespace. Istio's sidecar is a build of **Envoy**.
All traffic in and out of your app goes through it. The critical consequence: *your pod now has two
things that can run out of capacity, not one.*

**The app** is the actual service — the code that serves Issues, or Pull Requests, or Actions.

**The gateway auth path** is the shared machinery that turns a cookie, token or API key into "yes, this
is user X and they may do Y". Nearly every request touches it. A component that everything depends on
is worth identifying in your own system, because it converts any local failure into a global one.

Two more terms from the incident report. **The HPA** (Horizontal Pod Autoscaler) is the Kubernetes
controller that adds or removes pod replicas based on a metric you choose — usually CPU. **Codeload**
is GitHub's service for raw file and archive downloads: the `Download ZIP` button, `raw.githubusercontent`,
`git archive`. And the report mentions SAML/OIDC (enterprise single sign-on), SCIM (automated user
provisioning) and GHEC with Data Residency (GitHub Enterprise Cloud with data pinned to a region) —
all of which lean on that same auth path, which is why they went down too.

## What actually broke, and for how long

Impact was not uniform, and that is the first thing worth drawing. Different services entered and left
degradation at different times, and the tail was much longer than the body.

<figure class="diagram">
<svg viewBox="0 0 800 300" role="img" aria-label="Timeline of the 17 August 2026 GitHub outage from 13:28 to 21:15 UTC, showing five service lanes with different degradation windows and a recovery marker at 16:36 UTC.">
  <text class="d-cap" x="0" y="20">17 AUG 2026 · 13:28 → 21:15 UTC · 7H 47M</text>
  <text class="d-cap" x="0" y="57">WEB + API · ~20% ERRORS</text>
  <rect class="d-accent-fill" x="196" y="46" width="413" height="14"/>
  <text class="d-cap" x="0" y="91">ARCHIVE + RAW · ~50%</text>
  <rect class="d-accent-fill" x="196" y="80" width="218" height="14"/>
  <text class="d-cap" x="0" y="125">ACTIONS</text>
  <rect class="d-accent-fill" x="205" y="114" width="326" height="14"/>
  <text class="d-cap" x="0" y="159">GIT OPERATIONS</text>
  <rect class="d-accent-fill" x="312" y="148" width="246" height="14"/>
  <text class="d-cap" x="0" y="193">COPILOT TOKEN SERVICE</text>
  <rect class="d-accent-fill" x="245" y="182" width="527" height="14"/>
  <rect class="d-box d-pulse" x="558" y="182" width="214" height="14"/>
  <text class="d-cap" x="560" y="214">RESIDUAL · RETRY-DRIVEN</text>
  <path class="d-rule" d="M196 244 L790 244"/>
  <path class="d-rule" d="M196 244 L196 250 M414 244 L414 250 M531 244 L531 250 M772 244 L772 250"/>
  <text class="d-cap" x="176" y="266">13:28</text>
  <text class="d-cap" x="394" y="266">16:36</text>
  <text class="d-cap" x="511" y="266">18:03</text>
  <text class="d-cap" x="752" y="266">21:02</text>
  <path class="d-accent-line d-flow" d="M414 30 L414 240"/>
  <text class="d-accent-cap" x="420" y="28">HAPROXY PAUSED ON ALL FOUR NODES → BROAD RECOVERY</text>
  <path class="d-rule" d="M0 282 L800 282"/>
  <text class="d-cap" x="0" y="298">THE TRIGGER WAS GONE AT 16:36. THE OUTAGE HAD FOUR AND A HALF MORE HOURS TO RUN.</text>
</svg>
</figure>

At peak, roughly **20% of web and API requests failed**, and codeload — archives and raw file content —
failed at around **50%**. Note that Actions workflows in GHEC with Data Residency broke too, because
those workflows pull public step definitions (`actions/checkout` and friends) hosted on GitHub.com. A
data-residency tenant isolates *your data* to a region; it does not isolate your *build-time
dependencies* from the public service. That is a genuinely non-obvious blast-radius path and a good
thing to go check in your own setup.

Most services came back at **16:36 UTC** as the Central US datacenter recovered. Actions stayed degraded
until roughly **18:03**. The Copilot Token Service was not fully healthy until **21:02**, and the
incident closed at **21:15**.

That shape — a sharp recovery at 16:36 followed by a long, ragged tail on one specific service — is the
whole story in outline. Hold on to the question: *what was still generating load at 19:00, six hours in?*

## Domino one: the autoscaler was watching the wrong meter

Here is GitHub's sentence, and it is dense: the cause was an **Istio sidecar pod reaching its
concurrency limits and failing to auto scale correctly because of a misconfigured policy that watched
host service but not sidecar limits**.

Unpacked: a **concurrency limit** is a cap on how many requests a proxy will handle simultaneously.
Envoy has several — maximum active connections, maximum pending requests, maximum concurrent requests.
When you exceed one, Envoy does not slow down gracefully; it queues, and then it rejects.

The autoscaling policy was pointed at *the host service* — the application container's metrics, usually
CPU. But the thing running out of room was the *sidecar*, and a proxy that is saturated on connection
count is often barely using any CPU at all. Proxying is cheap per request; it is holding thousands of
sockets open that costs you. So the app looked healthy by every number the HPA could see.

<figure class="diagram">
<svg viewBox="0 0 800 330" role="img" aria-label="A pod containing an app container and an Istio sidecar. The autoscaler watches the app container CPU, which stays low, while the sidecar concurrency meter fills to its limit unobserved.">
  <text class="d-cap" x="0" y="14">AUTOSCALING POLICY</text>
  <rect class="d-box" x="0" y="40" width="150" height="60"/>
  <text class="d-key" x="24" y="76">HPA</text>
  <text class="d-cap" x="230" y="14">POD</text>
  <rect class="d-ghost" x="230" y="26" width="500" height="180"/>
  <rect class="d-box" x="252" y="52" width="200" height="132"/>
  <text class="d-cap" x="266" y="80">APP CONTAINER</text>
  <text class="d-cap" x="266" y="128">CPU &#183; UNDER TARGET</text>
  <rect class="d-ghost" x="266" y="138" width="172" height="12"/>
  <rect class="d-fill-rule" x="266" y="138" width="55" height="12"/>
  <text class="d-cap" x="266" y="172">NOTHING TO SCALE ON</text>
  <rect class="d-accent-box" x="500" y="52" width="200" height="132"/>
  <text class="d-cap" x="514" y="80">ISTIO-PROXY &#183; SIDECAR</text>
  <text class="d-accent-cap" x="514" y="128">CONCURRENCY &#183; AT LIMIT</text>
  <rect class="d-ghost" x="514" y="138" width="172" height="12"/>
  <rect class="d-accent-fill d-grow" x="514" y="138" width="172" height="12"/>
  <text class="d-accent-cap d-blink" x="514" y="172">EVERYTHING QUEUES HERE</text>
  <path class="d-accent-line d-flow" d="M150 70 L246 70"/>
  <path class="d-accent-fill" d="M252 70 l-12 -6 l0 12 z"/>
  <text class="d-accent-cap" x="158" y="62">WATCHES CPU</text>
  <path class="d-ghost" d="M75 100 L75 250 L600 250 L600 190"/>
  <path class="d-rule" d="M366 240 L386 260 M386 240 L366 260"/>
  <text class="d-cap" x="398" y="255">SIDECAR CONCURRENCY &#8212; NEVER OBSERVED</text>
  <path class="d-rule" d="M0 278 L800 278"/>
  <text class="d-cap" x="0" y="300">A NEW TRAFFIC PEAK ARRIVES. THE APP IS FINE. THE PROXY IN FRONT OF IT IS NOT.</text>
  <text class="d-cap" x="0" y="322">THE SCALING SIGNAL AND THE SATURATION POINT LIVE IN DIFFERENT CONTAINERS.</text>
</svg>
</figure>

A new traffic peak arrived. The application containers sat well below their CPU threshold, so the HPA
did nothing — *correctly, by its own configuration*. It was not broken. It was answering a question
nobody should have been asking. Meanwhile the proxy in front of those containers hit its concurrency
ceiling, started queuing, and then started failing requests.

The takeaway is not "Istio is dangerous". It is that **an autoscaler is only as good as the saturation
signal you point it at**, and adopting a service mesh silently gives every pod a second saturation point
that your existing HPA specs know nothing about. If you run a mesh, go and look at whether anything in
your cluster scales on sidecar metrics. Usually nothing does.

The general version of this — worth internalising early — is that *the metric you alert on and the
resource you actually run out of are often different things*. CPU is popular because it is easy to
collect, not because it is usually the constraint. Connection counts, thread-pool occupancy, database
connection-pool checkouts, file descriptors and queue depth are all more common real limits.

## Domino two: four HAProxy nodes ran out of flows

Saturation does not stay local. A proxy that stops draining connections holds them open. The thing in
front of it holds its own side open too, and so on backwards through the path. GitHub's report:

> "One failure cascaded to more and eventually four HAProxy nodes exhausted their flow limits,
> degrading the gateway auth path and causing widespread authentication latency and failures."

<figure class="diagram">
<svg viewBox="0 0 800 320" role="img" aria-label="A saturated sidecar backs up into four HAProxy nodes whose flow tables fill one after another, degrading the shared gateway authentication path.">
  <text class="d-cap" x="0" y="14">SATURATED MESH</text>
  <rect class="d-accent-box d-pulse" x="0" y="26" width="140" height="200"/>
  <text class="d-key" x="14" y="118">ISTIO</text>
  <text class="d-key" x="14" y="140">SIDECARS</text>
  <text class="d-cap" x="14" y="170">HOLDING</text>
  <text class="d-cap" x="14" y="186">CONNECTIONS</text>
  <text class="d-cap" x="220" y="14">HAPROXY · FLOW TABLES</text>
  <rect class="d-box" x="220" y="26" width="300" height="42"/>
  <text class="d-cap" x="232" y="52">NODE 1</text>
  <rect class="d-ghost" x="320" y="40" width="186" height="14"/>
  <rect class="d-accent-fill d-grow d-d1" x="320" y="40" width="186" height="14"/>
  <rect class="d-box" x="220" y="78" width="300" height="42"/>
  <text class="d-cap" x="232" y="104">NODE 2</text>
  <rect class="d-ghost" x="320" y="92" width="186" height="14"/>
  <rect class="d-accent-fill d-grow d-d2" x="320" y="92" width="186" height="14"/>
  <rect class="d-box" x="220" y="130" width="300" height="42"/>
  <text class="d-cap" x="232" y="156">NODE 3</text>
  <rect class="d-ghost" x="320" y="144" width="186" height="14"/>
  <rect class="d-accent-fill d-grow d-d3" x="320" y="144" width="186" height="14"/>
  <rect class="d-box" x="220" y="182" width="300" height="42"/>
  <text class="d-cap" x="232" y="208">NODE 4</text>
  <rect class="d-ghost" x="320" y="196" width="186" height="14"/>
  <rect class="d-accent-fill d-grow d-d4" x="320" y="196" width="186" height="14"/>
  <path class="d-accent-line d-flow" d="M140 47 L220 47"/>
  <path class="d-accent-line d-flow d-d1" d="M140 99 L220 99"/>
  <path class="d-accent-line d-flow d-d2" d="M140 151 L220 151"/>
  <path class="d-accent-line d-flow d-d3" d="M140 203 L220 203"/>
  <path class="d-accent-line d-flow-fast" d="M520 125 L600 125"/>
  <text class="d-cap" x="620" y="14">SHARED DEPENDENCY</text>
  <rect class="d-accent-box d-blink d-d4" x="620" y="26" width="180" height="200"/>
  <text class="d-key" x="636" y="106">GATEWAY</text>
  <text class="d-key" x="636" y="128">AUTH PATH</text>
  <text class="d-accent-cap" x="636" y="160">EVERY REQUEST</text>
  <text class="d-accent-cap" x="636" y="176">GOES THROUGH IT</text>
  <path class="d-rule" d="M0 258 L800 258"/>
  <text class="d-cap" x="0" y="280">FLOW LIMITS ARE A FIXED RESOURCE. SLOW BACKENDS DO NOT REDUCE DEMAND — THEY HOLD FLOWS OPEN LONGER.</text>
  <text class="d-cap" x="0" y="302">ONE SATURATED HOP BECAME A PLATFORM-WIDE AUTH FAILURE BECAUSE AUTH IS ON EVERY PATH.</text>
</svg>
</figure>

Why does this cascade so fast? Because **a slow backend consumes more of a load balancer's capacity,
not less** — and that is worth doing the arithmetic on, because it is the least intuitive step in the
whole incident.

The relationship is **Little's Law**, one of the few pieces of queueing theory worth memorising:

> **L = λ × W** — the average number of requests in the system equals the arrival rate times the
> average time each one spends there.

Rearranged for our purposes: **the throughput a fixed number of slots can support is inversely
proportional to latency.** Suppose one HAProxy node tracks 20,000 concurrent flows, and requests
normally complete in 50 ms:

```
capacity = 20,000 slots ÷ 0.05 s  =  400,000 requests/second
```

Now the backend gets slow and requests take 2 seconds instead:

```
capacity = 20,000 slots ÷ 2.0 s   =   10,000 requests/second
```

Nothing crashed. No configuration changed. Available throughput fell by **40×** purely because each
request occupies its slot longer. This is why latency and availability are the same problem wearing
different hats, and why "it's just slow, it's not down" stops being true at scale.

The second reason the blast radius was so wide: the shared thing these load balancers fronted was
*authentication*, which sits on essentially every request path. That is why a network-layer problem in
one region surfaced to users as Issues, Pull Requests, Actions, Pages, Webhooks and Copilot failing
simultaneously. Those services were not independently broken. They were all queued behind the same
token check.

## The amplifier: retries

This is the part that turned a capacity incident into a seven-hour one, and the part most directly
applicable to code you will write next week.

> "The problem was worsened by optimistic retry logic which overloaded internal load balancers."
>
> "Delayed replies to a single internal endpoint triggered a latent retry bug in VS Code that amplified
> traffic by approximately 10x."

The numbers state it plainly. The Copilot Token Service normally serves **7–9K requests per second**.
During the incident it was receiving **70–100K**.

<figure class="diagram">
<svg viewBox="0 0 800 330" role="img" aria-label="Retry amplification: one slow endpoint causes clients to retry without backoff, turning 7 to 9 thousand requests per second into 70 to 100 thousand, which keeps the endpoint slow.">
  <text class="d-cap" x="0" y="14">CLIENTS &#183; VS CODE</text>
  <rect class="d-box" x="0" y="26" width="150" height="120"/>
  <text class="d-key" x="16" y="76">EDITORS</text>
  <text class="d-cap" x="16" y="104">ONE TOKEN</text>
  <text class="d-cap" x="16" y="120">REQUEST EACH</text>
  <path class="d-accent-line d-flow-slow" d="M150 86 L294 86"/>
  <path class="d-accent-fill" d="M300 86 l-12 -6 l0 12 z"/>
  <text class="d-cap" x="182" y="76">7&#8211;9K RPS</text>
  <text class="d-cap" x="300" y="14">ONE INTERNAL ENDPOINT</text>
  <rect class="d-accent-box d-pulse" x="300" y="26" width="180" height="120"/>
  <text class="d-key" x="316" y="76">SLOW REPLY</text>
  <text class="d-cap" x="316" y="104">NOT AN ERROR &#8212;</text>
  <text class="d-cap" x="316" y="120">JUST LATE</text>
  <path class="d-accent-line d-flow-fast" d="M390 146 L390 200 L75 200 L75 152"/>
  <path class="d-accent-fill" d="M75 146 l6 12 l-12 0 z"/>
  <text class="d-accent-cap" x="150" y="222">LATENT RETRY BUG &#183; NO BACKOFF &#183; ~10&#215; PER CLIENT</text>
  <path class="d-accent-line d-flow-fast" d="M480 46 L640 46"/>
  <path class="d-accent-line d-flow-fast d-d1" d="M480 66 L640 66"/>
  <path class="d-accent-line d-flow-fast d-d2" d="M480 86 L640 86"/>
  <path class="d-accent-line d-flow-fast d-d3" d="M480 106 L640 106"/>
  <path class="d-accent-line d-flow-fast d-d4" d="M480 126 L640 126"/>
  <text class="d-cap" x="640" y="14">COPILOT TOKEN SERVICE</text>
  <rect class="d-accent-box d-blink" x="640" y="26" width="160" height="120"/>
  <text class="d-key" x="654" y="72">70&#8211;100K</text>
  <text class="d-key" x="654" y="94">RPS</text>
  <text class="d-accent-cap" x="654" y="126">&#8776; 10&#215; NORMAL</text>
  <path class="d-rule" d="M0 250 L800 250"/>
  <text class="d-cap" x="0" y="272">A RETRY IS A REQUEST YOU CHOSE TO MAKE BECAUSE THE SYSTEM WAS ALREADY STRUGGLING.</text>
  <text class="d-cap" x="0" y="294">AT SCALE, CLIENT-SIDE RETRY POLICY IS SERVER-SIDE CAPACITY POLICY &#8212; WRITTEN BY SOMEONE ELSE.</text>
  <text class="d-cap" x="0" y="316">HERE IT WAS WRITTEN IN AN EDITOR SHIPPED MONTHS EARLIER, AND ONLY EXECUTED UNDER LATENCY.</text>
</svg>
</figure>

Those extra 90,000 requests per second were not new users. They were the same users, asking again.

**Where the 10× comes from.** Bounded retries are additive and survivable. If 8,000 requests/second run
at a 20% failure rate and each failure is retried twice with a cap, you get roughly
`8,000 + (1,600 × 2) = 11,200` — a 1.4× bump. Painful, not fatal. You get an *order of magnitude* when
the retry has no cap, or when the retry's own failure re-enters the same code path, so one user action
spawns a chain rather than a fixed number of attempts. GitHub describes exactly that: *"a failed token
operation could generate many extra requests and enter a retry loop."*

Three things are worth pulling out.

**The trigger was latency, not errors.** The endpoint replied — just late. Enormous amounts of retry
logic are written to handle *errors* and quietly treat a timeout as a free do-over. It is not free. A
client that gives up at 2 s and retries has not reduced its load on the server: the original request is
usually still executing on the other side, so the client has now doubled the work in flight. Timeouts
create load; they do not cancel it.

**The bug was latent until the exact moment it mattered.** VS Code's retry path had shipped long before
and had been exercised against healthy infrastructure the entire time — where it never fires. Retry code
is uniquely nasty in this way: **it is effectively dead code in production until the one moment the
system can least afford it to be wrong.** Almost nobody load-tests the degraded path, so almost nobody
finds these before an incident does.

**Amplification multiplies through layers.** Client retries × gateway retries × internal service retries.
If three layers each retry three times, one user action can become twenty-seven backend calls. GitHub
had optimistic retry logic in its own gateways *and* the client bug on top.

**What to actually do in your own code.** Four things, in rough order of value:

- **Exponential backoff with jitter.** Wait longer after each failure — 100 ms, 200 ms, 400 ms — and add
  randomness to each wait. Backoff stops one client hammering; *jitter* stops ten thousand clients that
  all failed at the same instant from retrying in perfect unison. Without jitter you have not spread the
  load, you have merely scheduled it.
- **A retry budget, not a retry count.** Cap retries as a fraction of total traffic — say, retries may
  never exceed 10% of requests. Per-request counts still allow the whole fleet to triple its load at
  once; a budget cannot.
- **Retry only what is safe and worth retrying.** An idempotent read (fetch a token) can be repeated
  safely. A non-idempotent write (charge a card, create an issue) can double-execute unless you send an
  idempotency key. And never retry a `400` or `403` — the answer will not change, so you are just
  generating load.
- **Load-test the failure path.** Deliberately make a dependency slow — not down, *slow* — and watch what
  your client does. This is the single test that would have caught the VS Code bug.

## Why it stayed down after the cause was fixed

At 16:36 the Central US problem was addressed and most services recovered. The Copilot Token Service kept
failing for another four and a half hours. Nothing was still triggering it. So what was keeping it down?

This is a **metastable failure**, and it is the most useful concept in this entire post. The system has
two states it can sit in stably: healthy, and congested. Once it is pushed into the congested state, the
load generated *by being broken* is enough to keep it broken — independently of whatever pushed it there.

The everyday version is a motorway traffic jam. A lorry blocks a lane at 08:00 and is towed away by
08:20, but the jam is still there at 10:00. The cause is long gone; the queue now sustains itself,
because stop-start traffic has lower throughput than free-flowing traffic. Removing the lorry does not
clear the jam. Only reducing the number of cars entering does.

<figure class="diagram">
<svg viewBox="0 0 800 330" role="img" aria-label="Metastable failure drawn as a double well: a healthy basin and a deeper congested basin separated by a hump. A retry feedback loop holds the system in the congested basin after the trigger is gone, and only shedding all load pushes it back over the hump.">
  <text class="d-cap" x="0" y="14">TWO STABLE STATES &#183; ONE TRIGGER, LONG GONE</text>
  <path class="d-rule" d="M20 70 C90 70 130 165 230 165 C330 165 340 80 410 80 C480 80 490 205 590 205 C690 205 720 120 780 100"/>
  <circle class="d-accent-fill" cx="230" cy="157" r="8"/>
  <text class="d-cap" x="196" y="140">HEALTHY</text>
  <text class="d-cap" x="166" y="196">CAPACITY &gt; DEMAND</text>
  <circle class="d-accent-fill d-pulse" cx="590" cy="197" r="8"/>
  <text class="d-accent-cap" x="548" y="234">CONGESTED &#183; STABLE</text>
  <text class="d-cap" x="548" y="252">DEMAND IS NOW SELF-GENERATED</text>
  <path class="d-accent-line d-flow-fast" d="M700 118 C736 118 736 168 700 168 C664 168 664 118 700 118"/>
  <path class="d-accent-fill" d="M700 112 l10 6 l-10 6 z"/>
  <text class="d-accent-cap" x="614" y="96">RETRY FEEDBACK LOOP</text>
  <path class="d-accent-line d-flow" d="M590 188 L590 46 L300 46 L300 150"/>
  <path class="d-accent-fill" d="M300 156 l6 -12 l-12 0 z"/>
  <text class="d-accent-cap" x="312" y="38">ONLY A SHOVE BIG ENOUGH GETS BACK OVER THE HUMP</text>
  <path class="d-rule" d="M0 278 L800 278"/>
  <text class="d-accent-cap" x="0" y="300">FAILURES &#8594; RETRIES &#8594; LOAD &#8594; FAILURES. THE OUTAGE IS NOW ITS OWN CAUSE.</text>
  <text class="d-cap" x="0" y="322">THE TRIGGER IS A SEPARATE QUESTION FROM WHAT SUSTAINS THE OUTAGE. FIXING THE FIRST DOES NOT FIX THE SECOND.</text>
</svg>
</figure>

Retries are the mechanism that makes a software system behave like that traffic jam. One user action
produces many requests; each one fails; each failure produces more requests. Demand is now a function of
the *failure rate*, not of user activity — so the system generates precisely enough load to keep failing.

Which explains why the fix that worked looks so violent from the outside:

**Pausing HAProxy on all four nodes simultaneously produced immediate broad recovery.** Turning the load
balancer off is the correct move here. It drops every in-flight retry at once, lets the backends drain
their queues, and breaks the feedback loop. Doing all four *simultaneously* matters: pause them one at a
time and the retries just pile onto whichever node is still up.

Note what would *not* have worked. Adding capacity gets swallowed instantly, because demand rises to meet
whatever you provide when demand is driven by failures. This is the counterintuitive core of metastable
failure: **the lever is load, not capacity.**

Two other details fit the same pattern. Traffic shifted from Central US to Northern Virginia *was* served
successfully — but the retry storm followed it, so failover relocated the load without reducing it.
Failover helps when a *place* is broken; it does not help when the *load* is the problem. And **scraping
attacks on codeload endpoints** aggravated things throughout: archive downloads were already the worst-hit
surface at ~50% errors, and scrapers, unlike well-behaved clients, do not back off.

## What GitHub actually did about it

The mitigation sequence is a good template, and the striking thing is that four of the five steps *remove*
traffic rather than adding capacity.

<figure class="diagram">
<svg viewBox="0 0 800 250" role="img" aria-label="Five mitigation steps in order: pause HAProxy, shift traffic to Northern Virginia, ship a PR reducing gateway retries, block token requests with 403 at the load balancer, then ramp traffic back per site.">
  <rect class="d-box" x="0" y="40" width="140" height="86"/>
  <text class="d-accent-cap" x="14" y="64">01</text>
  <text class="d-cap" x="14" y="86">PAUSE HAPROXY</text>
  <text class="d-cap" x="14" y="102">ON ALL 4 NODES</text>
  <text class="d-cap" x="14" y="118">AT ONCE</text>
  <path class="d-accent-line d-flow" d="M140 83 L165 83"/>
  <rect class="d-box" x="165" y="40" width="140" height="86"/>
  <text class="d-accent-cap" x="179" y="64">02</text>
  <text class="d-cap" x="179" y="86">SHIFT TRAFFIC</text>
  <text class="d-cap" x="179" y="102">TO NORTHERN</text>
  <text class="d-cap" x="179" y="118">VIRGINIA</text>
  <path class="d-accent-line d-flow d-d1" d="M305 83 L330 83"/>
  <rect class="d-box" x="330" y="40" width="140" height="86"/>
  <text class="d-accent-cap" x="344" y="64">03</text>
  <text class="d-cap" x="344" y="86">SHIP A PR</text>
  <text class="d-cap" x="344" y="102">CUTTING GATEWAY</text>
  <text class="d-cap" x="344" y="118">RETRY LOGIC</text>
  <path class="d-accent-line d-flow d-d2" d="M470 83 L495 83"/>
  <rect class="d-accent-box" x="495" y="40" width="140" height="86"/>
  <text class="d-accent-cap" x="509" y="64">04</text>
  <text class="d-cap" x="509" y="86">403 ON INBOUND</text>
  <text class="d-cap" x="509" y="102">TOKEN REQUESTS</text>
  <text class="d-cap" x="509" y="118">AT THE LB</text>
  <path class="d-accent-line d-flow d-d3" d="M635 83 L660 83"/>
  <rect class="d-box" x="660" y="40" width="140" height="86"/>
  <text class="d-accent-cap" x="674" y="64">05</text>
  <text class="d-cap" x="674" y="86">RAMP BACK UP</text>
  <text class="d-cap" x="674" y="102">GRADUALLY,</text>
  <text class="d-cap" x="674" y="118">PER-SITE</text>
  <path class="d-rule" d="M0 168 L800 168"/>
  <text class="d-cap" x="0" y="190">FOUR OF FIVE STEPS REMOVE LOAD. ONLY THE LAST ADDS ANY BACK — AND ONLY SLOWLY.</text>
  <text class="d-cap" x="0" y="212">STEP 04 IS THE UNCOMFORTABLE ONE: DELIBERATELY FAILING REQUESTS FAST SO THE SERVICE CAN RECOVER.</text>
  <text class="d-cap" x="0" y="234">STEP 05 IS THE ONE PEOPLE SKIP, AND SKIPPING IT PUTS YOU STRAIGHT BACK IN THE CONGESTED STATE.</text>
</svg>
</figure>

**Step 04 deserves a note**, because it looks wrong the first time you see it. Returning `403` to inbound
token requests at the load balancer means deliberately failing users who would otherwise have been served.
The logic: a *fast rejection* costs the system almost nothing — no backend call, no held flow, slot
released immediately. A *slow success* costs a tracked flow, a queued connection, and (thanks to the
client bug) ten more requests behind it. When a system is metastable, **cheap failure is the resource you
are protecting.** This is called **load shedding**, and it is a lever worth building before you need it.

**Step 05 is the one that gets skipped under pressure.** Restoring traffic all at once re-creates a
*thundering herd*: every client that has been failing for hours is now retrying, and they all arrive
together and knock the service straight back over. Ramping gradually, per-site, is what converts a
mitigation into an actual recovery.

The published follow-up actions map cleanly onto the chain: correct the autoscaling policies to account
for sidecar concurrency; audit Istio request, concurrency and scaling limits across services; review
retry limits and backoff across gateways *and* clients; fix the VS Code retry behaviour; and improve
load-balancer capacity monitoring and regional failover safeguards. Two of the five are about retries,
which — given that retries owned four and a half of the seven hours — is the right proportion.

## The other half: why Git is hard to host at all

Everything above could have happened to any large platform. But GitHub is not any platform, and the
reason its core is unusually deep and unusually stateful is Git itself. Cursor's engineering write-up on
running Git at scale is the best recent treatment of why, and it starts from **packfiles**.

First, the object model, because the rest depends on it. Git stores four kinds of object, each addressed
by the hash of its own contents:

- a **blob** is the contents of a file;
- a **tree** is a directory listing — filenames pointing at blob or tree hashes;
- a **commit** points at one tree (the whole project state) plus its parent commit(s);
- a **tag** is a named pointer.

Because every object is named by its own hash, and objects reference each other by hash, a repository is
a **DAG** — a directed acyclic graph. That is the elegant part. The awkward part is how it is stored. Git
does not keep millions of loose files; it compresses them into **packfiles**:

> "Packfiles are the fundamental building block of Git storage *and* Git networking. When you push or
> fetch data from a repository, it's transferred as a packfile." They are "large binary files that must
> exist on a filesystem for Git to access them."

That last clause rules out most of the standard scaling playbook. You cannot simply drop Git objects into
a key-value store and serve them from stateless workers, because the wire protocol wants a packfile, and
packfiles want a real filesystem.

### Problem one: you cannot prefetch a graph you have not read yet

You can look up any object by its hash. But to do anything useful — resolve a branch, produce a diff,
serve a clone — you must *walk* the graph, and the walk is inherently serial:

> "At every step of this walk, you don't know the value of the next pointer until you fetch the previous
> one."

<figure class="diagram">
<svg viewBox="0 0 800 260" role="img" aria-label="Walking a Git DAG one hop at a time: commit to tree to subtree to blob, where each SHA is only discovered after fetching the previous object, so no prefetching is possible.">
  <text class="d-cap" x="0" y="14">POINTER CHASING · ONE ROUND TRIP PER HOP</text>
  <rect class="d-box" x="0" y="40" width="120" height="52"/>
  <text class="d-key" x="16" y="72">COMMIT</text>
  <circle class="d-accent-fill d-blink d-d1" cx="112" cy="48" r="5"/>
  <path class="d-accent-line d-flow d-d1" d="M120 66 L170 66"/>
  <rect class="d-box" x="170" y="40" width="120" height="52"/>
  <text class="d-key" x="186" y="72">TREE</text>
  <circle class="d-accent-fill d-blink d-d2" cx="282" cy="48" r="5"/>
  <path class="d-accent-line d-flow d-d2" d="M290 66 L340 66"/>
  <rect class="d-box" x="340" y="40" width="120" height="52"/>
  <text class="d-key" x="356" y="72">SUBTREE</text>
  <circle class="d-accent-fill d-blink d-d3" cx="452" cy="48" r="5"/>
  <path class="d-accent-line d-flow d-d3" d="M460 66 L510 66"/>
  <rect class="d-box" x="510" y="40" width="120" height="52"/>
  <text class="d-key" x="526" y="72">SUBTREE</text>
  <circle class="d-accent-fill d-blink d-d4" cx="622" cy="48" r="5"/>
  <path class="d-accent-line d-flow d-d4" d="M630 66 L680 66"/>
  <rect class="d-box" x="680" y="40" width="120" height="52"/>
  <text class="d-key" x="696" y="72">BLOB</text>
  <circle class="d-accent-fill d-blink d-d5" cx="792" cy="48" r="5"/>
  <path class="d-ghost" d="M0 120 L800 120"/>
  <text class="d-cap" x="0" y="146">SHA OF HOP N+1 IS INSIDE THE BYTES OF HOP N</text>
  <text class="d-accent-cap" x="0" y="166">→ NO PREFETCH. NO BATCHING. NO PIPELINING.</text>
  <text class="d-cap" x="0" y="192">ON LOCAL NVME EACH HOP IS ~100 MICROSECONDS AND NOBODY NOTICES.</text>
  <text class="d-cap" x="0" y="212">OVER A KV STORE OR NETWORK FS EACH HOP IS A ROUND TRIP, AND A WALK IS MILLIONS OF HOPS.</text>
  <path class="d-rule" d="M0 234 L800 234"/>
  <text class="d-accent-cap" x="0" y="252">THE LATENCY THAT KILLS YOU IS SERIAL, SO IT DOES NOT AMORTISE AWAY WITH PARALLELISM.</text>
</svg>
</figure>

This is the crucial performance property. The hash of the next object is *inside the bytes of the current
one*, so you cannot batch the lookups, cannot pipeline them, and cannot prefetch. On a local NVMe SSD each
hop costs about 100 microseconds and nobody notices. Put those objects behind a network — a distributed
key-value store, a networked filesystem — and each hop becomes a network round trip of a millisecond or
more. A walk is millions of hops. Serial latency does not amortise away by adding machines.

This is why "just put it behind a distributed object store" keeps failing. Google's JGit-based design is
the well-known attempt; per Cursor, the protocol's demand for packfiles over the network made clone
performance *"bad enough to discard the design altogether."*

### Problem two: the on-disk layout is deliberately hostile to remote storage

Even once you have located an object, you usually do not have the object. Git uses **delta compression**:
rather than storing two similar versions of a file twice, it stores one in full and the other as *"apply
these edits to that one"*.

> "Most objects are stored as a delta on top of another object in the same packfile. Reading an
> individual object... also involves following physical hops in the on-disk format."

<figure class="diagram">
<svg viewBox="0 0 800 290" role="img" aria-label="Inside a packfile, objects sit at unrelated offsets and are stored as deltas against other objects, so reading one logical object means several random physical reads chained across the file.">
  <text class="d-cap" x="0" y="14">ONE PACKFILE &#183; OBJECTS PLACED AT UNRELATED OFFSETS</text>
  <rect class="d-ghost" x="0" y="30" width="800" height="56"/>
  <rect class="d-box" x="32" y="42" width="54" height="32"/>
  <rect class="d-box" x="152" y="42" width="54" height="32"/>
  <rect class="d-accent-box" x="286" y="42" width="54" height="32"/>
  <rect class="d-box" x="404" y="42" width="54" height="32"/>
  <rect class="d-box" x="512" y="42" width="54" height="32"/>
  <rect class="d-box" x="648" y="42" width="54" height="32"/>
  <path class="d-accent-line d-flow" d="M313 88 C302 120 190 120 179 90"/>
  <path class="d-accent-line d-flow d-d1" d="M179 88 C168 136 70 136 59 90"/>
  <path class="d-accent-line d-flow d-d2" d="M59 88 C62 154 536 154 539 90"/>
  <text class="d-accent-cap" x="352" y="62">WANTED: ONE OBJECT</text>
  <text class="d-cap" x="0" y="178">DELIVERED: A DELTA CHAIN OF PHYSICAL READS AT SCATTERED OFFSETS</text>
  <path class="d-rule" d="M0 198 L800 198"/>
  <text class="d-cap" x="0" y="220">LOCAL NVME &#183; RANDOM READS ARE CHEAP AND THE DESIGN IS CORRECT</text>
  <text class="d-accent-cap" x="0" y="240">NFS / GFS / DRBD &#183; EVERY HOP CROSSES A NETWORK AND THE DESIGN IS A DISASTER</text>
  <text class="d-cap" x="0" y="266">GIT ASSUMES FILESYSTEM SEMANTICS &#8212; LOCKING, TEARING, READING, SYNCING &#8212;</text>
  <text class="d-cap" x="0" y="286">TUNED FOR A SLOW DEVELOPER LAPTOP, NOT FOR A NETWORKED FILESYSTEM.</text>
</svg>
</figure>

So one logical read becomes a chain of physical reads at scattered offsets, each of which must be
decompressed and applied in order. On a local SSD, random reads are cheap and this design is a clear win.
Over a network filesystem, every hop in that chain crosses the wire, and the same design is a disaster.
Cursor adds that Git *"makes a lot of assumptions about filesystem semantics (locking, tearing, reading,
syncing...)"* tuned for a slow developer laptop — assumptions network filesystems do not honour. GitHub's
own experiments with distributed filesystems were *"terrible to operate day to day"*, with repositories
ending up as *"pets, not cattle"* — individually named, hand-nursed machines rather than interchangeable
ones.

### The 2013 answer: Spokes, and where it runs out

What GitHub built — and what became the industry pattern — was **Spokes**: keep whole packfiles on local
NVMe drives, keep several replicas strongly consistent, and coordinate writes with **three-phase commit**.

Plainly: every repository lives on three machines. When you push, a coordinator asks all three "can you
accept this?", then "commit it", and the push is acknowledged once a *majority* have agreed. That majority
requirement — a **quorum** — is what guarantees you can never lose an acknowledged push while at least
two copies survive.

It works, and it has a hard ceiling:

> "The latency of every step is bound by the slowest of all the servers in the cluster. The more replicas
> you add to a cluster, the worse push throughput gets."

<figure class="diagram">
<svg viewBox="0 0 800 360" role="img" aria-label="Comparison of Spokes, which uses three-phase commit across replicas and is bound by the slowest node, with Continuity, which writes a write-ahead log to S3 using compare-and-swap and gossips to elastic read replicas.">
  <text class="d-cap" x="0" y="14">SPOKES &#183; 2013 &#183; CONSENSUS IS THE SOURCE OF TRUTH</text>
  <path class="d-rule" d="M382 26 L382 306"/>
  <rect class="d-box" x="0" y="30" width="110" height="44"/>
  <text class="d-key" x="20" y="58">PUSH</text>
  <path class="d-accent-line d-flow" d="M110 52 L170 52"/>
  <rect class="d-box" x="170" y="30" width="86" height="44"/>
  <text class="d-cap" x="188" y="56">NODE A</text>
  <rect class="d-box" x="170" y="88" width="86" height="44"/>
  <text class="d-cap" x="188" y="114">NODE B</text>
  <rect class="d-accent-box d-pulse" x="170" y="146" width="86" height="44"/>
  <text class="d-accent-cap" x="188" y="166">NODE C</text>
  <text class="d-accent-cap" x="188" y="182">SLOW</text>
  <path class="d-accent-line d-flow" d="M256 52 L300 52 L300 168 L256 168"/>
  <path class="d-accent-line d-flow d-d1" d="M256 110 L300 110"/>
  <text class="d-accent-cap" x="170" y="214">3PC &#183; MAJORITY ACK</text>
  <text class="d-cap" x="0" y="242">EVERY PHASE WAITS</text>
  <text class="d-cap" x="0" y="260">FOR THE SLOWEST NODE</text>
  <text class="d-cap" x="0" y="284">MORE REPLICAS &#8594;</text>
  <text class="d-accent-cap" x="0" y="302">WORSE PUSH THROUGHPUT</text>
  <text class="d-cap" x="410" y="14">CONTINUITY &#183; 2026 &#183; THE LOG IS THE SOURCE OF TRUTH</text>
  <rect class="d-box" x="410" y="30" width="100" height="44"/>
  <text class="d-key" x="428" y="58">PUSH</text>
  <path class="d-accent-line d-flow" d="M510 52 L556 52"/>
  <rect class="d-box" x="556" y="30" width="94" height="44"/>
  <text class="d-cap" x="568" y="50">ANY</text>
  <text class="d-cap" x="568" y="66">SERVER</text>
  <path class="d-accent-line d-flow" d="M650 52 L700 52"/>
  <rect class="d-accent-box" x="700" y="30" width="100" height="44"/>
  <text class="d-accent-cap" x="714" y="50">S3 WAL</text>
  <text class="d-accent-cap" x="714" y="66">CAS</text>
  <path class="d-accent-line d-flow-slow" d="M750 74 L750 110 L566 110"/>
  <path class="d-accent-fill" d="M560 110 l12 -6 l0 12 z"/>
  <text class="d-cap" x="574" y="102">GOSSIP &#183; UDP &#183; LOSSY IS FINE</text>
  <path class="d-accent-line d-flow-slow d-d1" d="M470 170 L470 146 L790 146 L790 80"/>
  <path class="d-accent-fill" d="M790 74 l6 12 l-12 0 z"/>
  <text class="d-accent-cap" x="486" y="138">CONDITIONAL GET &#8594; 304 STAY &#183; 200 CATCH UP</text>
  <rect class="d-box" x="410" y="170" width="120" height="44"/>
  <text class="d-cap" x="424" y="196">REPLICA</text>
  <rect class="d-box" x="546" y="170" width="120" height="44"/>
  <text class="d-cap" x="560" y="196">REPLICA</text>
  <rect class="d-ghost" x="682" y="170" width="118" height="44"/>
  <text class="d-cap" x="700" y="196">&#8230;HUNDREDS</text>
  <text class="d-cap" x="410" y="242">NO ELECTIONS &#183; NO PRIMARY &#183; NO QUORUM TO LOSE</text>
  <text class="d-cap" x="410" y="260">DISK IS A WARM CACHE, NOT THE TRUTH</text>
  <text class="d-accent-cap" x="410" y="284">120 PUSHES/S ON S3 STANDARD &#183; 300+ ON EXPRESS ONE ZONE</text>
  <text class="d-cap" x="410" y="302">READS SCALE LINEARLY TO 100 REPLICAS</text>
  <path class="d-rule" d="M0 326 L800 326"/>
  <text class="d-cap" x="0" y="348">SAME PACKFILES. THE CHANGE IS WHICH COPY IS AUTHORITATIVE &#8212; AND HOW MANY YOU ARE ALLOWED TO HAVE.</text>
</svg>
</figure>

Every phase waits for the slowest participant, so each additional replica makes writes slower — the exact
opposite of how you would like a system to scale. The operational tax compounds it: Spokes needs external
databases holding routing tables, and constant checksumming to detect corruption. And corruption is not
just a data problem, it is an *availability* problem — *"if two of the three copies are corrupt, the
system can no longer accept pushes."* You are left running three mostly-idle replicas that cannot be
trimmed, because trimming them risks data loss.

The 2026 pressure is that repository shapes have diverged violently. A monorepo under heavy CI wants
hundreds of read replicas. An agent-generated throwaway repository wants one, briefly, and then wants to
vanish. A fixed replication factor chosen to keep consensus latency tolerable serves neither.

### Continuity: stop achieving consensus, start appending

Cursor's answer is to move authority out of the replica set entirely, into a **write-ahead log** stored in
S3. A WAL is the same idea a database or Kafka uses: an append-only, ordered record of everything that
happened, from which current state can be rebuilt by replaying it. Here the rule is *"we never acknowledge
a push until it has been fully persisted"* — persisted to the log, not to any particular server. S3 becomes
the source of truth, and the repository sitting on a server's disk is demoted to *"a warm cache."*

Once the log is authoritative, the consequences cascade:

- **No consensus.** No elections, no primary, no quorum. Any server can accept a push by doing an atomic
  **compare-and-swap** against S3 — "append my entry only if the log still ends where I think it does". If
  two servers race, one wins and the other simply retries. Same idea as an HTTP `If-Match`/ETag conditional
  write, or a CPU's atomic CAS instruction.
- **Elastic replication.** Hundreds of replicas for the monorepo, one for the tiny repo, zero for an idle
  one — evicted from disk and rebuilt from the log on demand. Replica count is now a caching decision, not
  a correctness decision.
- **Cheap, lossy replication.** A **gossip** packet over UDP tells replicas something changed. UDP does not
  guarantee delivery, and that is fine, because reads verify against S3 with a *conditional GET* — the same
  mechanism as browser caching, returning `304 Not Modified` if the replica is current or `200` with the
  data if it needs to catch up. A dropped packet costs a little staleness, never correctness.
- **Compaction done once.** Repacking is CPU-expensive, so only the primary does it; replicas download the
  compacted pack from S3 — *"trading bandwidth for CPU."*

Measured: **120 pushes/second** on S3 Standard while compacting and replicating, **300+/second** on S3
Express One Zone (where the bottleneck moves to local disk compaction), and read throughput scaling
linearly out to 100 replicas. The stated design goal — *"always be correct when degraded, and always fast
when healthy"* — is precisely the property the 17 August incident was missing.

## What the two halves have in common

The outage was not a Git storage failure. Git Operations were degraded from 15:21 to 18:23, but the
originating fault was in the mesh and the auth path: an application-tier problem.

The connection is subtler. **Git hosting concentrates state.** The reason GitHub cannot simply run more
stateless replicas of everything, or fail a repository over the way you fail over a web tier, is the
packfile constraint at the bottom of the stack — objects that must live on a real filesystem, walked
serially, delta-compressed against their neighbours. That gravity pulls the architecture towards fewer,
heavier, more tightly coupled components. And tightly coupled components are exactly what turns one
saturated sidecar into a platform-wide authentication failure.

Codeload is where the two halves touch. Archives and raw content were the worst-hit surface at ~50%
errors, and scraping attacks on those endpoints impeded recovery — because serving an archive is not a
cache lookup. It is packfile work: real CPU, real disk, on a stateful node you cannot trivially scale
sideways. The most expensive, hardest-to-shed surface in the incident was expensive for reasons that go
all the way down to Git's on-disk format.

## Four things to take away

**The trigger and the sustaining cause are different questions.** When you write or read a postmortem, ask
both: what knocked it over, and what kept it down? They usually have different fixes, and the second one
is usually the one that owned most of the downtime.

**Scale on your real saturation point, not on CPU.** A service mesh gives every pod two of them. Go and
check which one your HPA is reading — and more generally, whether the metric you alert on is actually the
resource you run out of.

**Treat client retry policy as capacity policy.** Your service's behaviour under load is partly written by
code you do not own, in editors and SDKs shipped months ago, which has never once been exercised in the
degraded regime. Backoff, jitter, retry budgets, idempotency keys — and a test that makes a dependency
*slow* rather than dead.

**Practise shedding load.** The mitigation that worked was pausing load balancers and returning `403`. If
the only lever you have ever rehearsed is *add capacity*, you have no lever at all against a metastable
failure, because the demand is no longer coming from users.

## Sources

- GitHub Status — **Incident with GitHub.com**, 17 August 2026, 13:28–21:15 UTC (full report and update
  timeline): [githubstatus.com/incidents/zkxwbgr0cnmx](https://www.githubstatus.com/incidents/zkxwbgr0cnmx).
  All timestamps, error rates, RPS figures and follow-up actions above are from this report.
- GitHub Community — **[2026-08-17] Incident Thread**, discussion #205164:
  [github.com/orgs/community/discussions/205164](https://github.com/orgs/community/discussions/205164).
- Cursor — **Git at any scale**, and specifically the *What's hard about Git* section:
  [cursor.com/blog/git-at-any-scale](https://cursor.com/blog/git-at-any-scale#whats-hard-about-git).
  All packfile, DAG, Spokes and Continuity quotes are from this post.
- GitHub Engineering — **Stretching Spokes**, background on the three-phase-commit replication design:
  [github.blog/engineering/stretching-spokes/](https://github.blog/engineering/stretching-spokes/).
- Bronson et al., **Metastable Failures in Distributed Systems**, HotOS '21 — the formal treatment of the
  "trigger versus sustaining effect" distinction, and worth reading in full; it is six pages:
  [sigops.org/s/conferences/hotos/2021/papers/hotos21-s11-bronson.pdf](https://sigops.org/s/conferences/hotos/2021/papers/hotos21-s11-bronson.pdf).
- Marc Brooker, **Timeouts, retries and backoff with jitter** (AWS Builders' Library) — the practical
  guide to getting retry logic right:
  [aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/).
- **Pro Git**, chapter 10 — Git internals, if the object model above was new:
  [git-scm.com/book/en/v2/Git-Internals-Git-Objects](https://git-scm.com/book/en/v2/Git-Internals-Git-Objects).
