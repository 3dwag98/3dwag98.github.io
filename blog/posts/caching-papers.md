---
title: Four papers that explain caching
date: 2026-07-12
tags: [caching, system-design, distributed-systems]
summary: What ARC, TinyLFU, Facebook's memcache paper and S3-FIFO actually say — the mechanisms drawn out, and why each one exists.
---

Almost every caching argument I have sat through was really one of four questions in disguise.
*What do we evict?* *What do we even let in?* *What happens when the cache is itself a
distributed system?* And, most recently, *do we need any of this machinery at all?*

There is a good paper behind each one. This is what they say and how the mechanisms actually
work, drawn out — because the diagrams are the part that makes them stick.

## 1. ARC — a cache that tunes itself

**The problem.** LRU is scan-resistant in exactly the wrong direction: one sequential pass over
a large table evicts everything you cared about. LFU has the opposite failure — it clings to
items that were hot last week. The pre-2003 fixes (LRU-K, 2Q, LIRS) all worked, and all had a
tuning knob that had to be set per workload. Nobody wants a knob.

**The mechanism.** ARC keeps *four* lists. Two are the cache itself; two are **ghost lists** —
metadata only, no data, remembering what was recently evicted.

<figure class="diagram">
<svg viewBox="0 0 800 260" role="img" aria-label="ARC's four lists: ghost B1, recent T1, frequent T2 and ghost B2, with an adaptive partition p between T1 and T2.">
  <text class="d-cap" x="0" y="14">GHOST · EVICTED FROM T1</text>
  <text class="d-cap" x="196" y="14">T1 · SEEN ONCE (RECENCY)</text>
  <text class="d-cap" x="424" y="14">T2 · SEEN AGAIN (FREQUENCY)</text>
  <text class="d-cap" x="620" y="14">GHOST · EVICTED FROM T2</text>
  <rect class="d-ghost" x="0" y="26" width="180" height="52"/>
  <rect class="d-box"   x="196" y="26" width="196" height="52"/>
  <rect class="d-box"   x="408" y="26" width="196" height="52"/>
  <rect class="d-ghost" x="620" y="26" width="180" height="52"/>
  <text class="d-key" x="76" y="58">B1</text>
  <text class="d-key" x="284" y="58">T1</text>
  <text class="d-key" x="496" y="58">T2</text>
  <text class="d-key" x="700" y="58">B2</text>
  <path class="d-rule" d="M196 92 L604 92"/>
  <text class="d-cap" x="330" y="110">THE CACHE — FIXED SIZE c</text>
  <path class="d-accent-line" d="M400 18 L400 100"/><text class="d-accent-cap" x="406" y="16">p</text><text class="d-cap" x="248" y="130">p = TARGET SIZE OF T1, ADAPTED ON EVERY GHOST HIT</text>
  <path class="d-accent-line" d="M120 168 L120 148"/>
  <path class="d-accent-fill" d="M120 142 l6 12 l-12 0 z"/>
  <text class="d-cap" x="0" y="186">HIT IN B1 — WE EVICTED IT TOO SOON</text>
  <text class="d-accent-cap" x="0" y="204">p GROWS · GIVE RECENCY MORE ROOM</text>
  <path class="d-accent-line" d="M690 168 L690 148"/>
  <path class="d-accent-fill" d="M690 142 l6 12 l-12 0 z"/>
  <text class="d-cap" x="524" y="186">HIT IN B2 — FREQUENT SET IS TOO SMALL</text>
  <text class="d-accent-cap" x="524" y="204">p SHRINKS · GIVE FREQUENCY MORE ROOM</text>
  <path class="d-rule" d="M0 232 L800 232"/>
  <text class="d-cap" x="0" y="252">GHOST LISTS HOLD KEYS ONLY — THE COST OF ADAPTING IS METADATA, NOT MEMORY</text>
</svg>
</figure>

A first reference puts an item in **T1**. A second reference promotes it to **T2**. Evictions
from T1 leave a key behind in **B1**; evictions from T2 leave one in **B2**.

The whole adaptation is one number, `p`, the target size of T1. A hit in B1 is the cache being
told *you evicted that too early, recency deserves more space* — so `p` grows. A hit in B2 says
the opposite, and `p` shrinks. Everything else follows: when you need a slot, evict from
whichever of T1 or T2 is currently over its target.

**What it costs.** Constant time per request, and roughly twice the metadata of LRU for the
ghost entries. There are no tuning parameters, which was the point. The catch is not technical:
ARC is covered by IBM patents, which is why you find it in ZFS and PostgreSQL's history but not
in Linux's page cache.

**Read it:** Nimrod Megiddo and Dharmendra Modha, *ARC: A Self-Tuning, Low Overhead Replacement
Cache*, USENIX FAST '03 —
[usenix.org/conference/fast-03](https://www.usenix.org/conference/fast-03/arc-self-tuning-low-overhead-replacement-cache).
The authors also wrote a shorter version for IEEE Computer, *Outperforming LRU with an Adaptive
Replacement Cache Algorithm* ([doi.org/10.1109/MC.2004.1297303](https://doi.org/10.1109/MC.2004.1297303)).

## 2. TinyLFU — the question is admission, not eviction

**The problem.** Every policy above answers "what do we throw out?". TinyLFU asks the prior
question: *should this item have been let in at all?* Most cache traffic is one-hit wonders. If
you admit them unconditionally, they evict something valuable on the way past.

Keeping true frequencies for that decision is the obvious approach and the obviously wrong one —
you would need a counter per key ever seen, which is larger than the cache.

**The mechanism.** Approximate the frequencies instead, in a few bits per item.

<figure class="diagram">
<svg viewBox="0 0 800 250" role="img" aria-label="A count-min sketch: a key is hashed into four rows of counters, and the estimate is the smallest of the four.">
  <text class="d-cap" x="0" y="14">COUNT–MIN SKETCH — 4-BIT COUNTERS, FOUR HASH ROWS</text>
  <text class="d-key" x="0" y="86">key</text>
  <path class="d-rule" d="M52 80 C 96 80, 96 44, 140 44"/>
  <path class="d-rule" d="M52 80 C 96 80, 96 72, 140 72"/>
  <path class="d-rule" d="M52 80 C 96 80, 96 100, 140 100"/>
  <path class="d-rule" d="M52 80 C 96 80, 96 128, 140 128"/>
  <text class="d-cap" x="92" y="24">h1..h4</text>
  <rect class="d-box" x="140" y="30" width="520" height="28"/>
  <rect class="d-box" x="140" y="58" width="520" height="28"/>
  <rect class="d-box" x="140" y="86" width="520" height="28"/>
  <rect class="d-box" x="140" y="114" width="520" height="28"/>
  <rect class="d-accent-fill" x="244" y="30" width="26" height="28"/>
  <rect class="d-accent-fill" x="400" y="58" width="26" height="28"/>
  <rect class="d-accent-fill" x="322" y="86" width="26" height="28"/>
  <rect class="d-accent-fill" x="556" y="114" width="26" height="28"/>
  <text class="d-on-accent" x="252" y="50">7</text>
  <text class="d-on-accent" x="408" y="78">4</text>
  <text class="d-on-accent" x="330" y="106">9</text>
  <text class="d-on-accent" x="564" y="134">4</text>
  <text class="d-cap" x="676" y="50">7</text>
  <text class="d-cap" x="676" y="78">4</text>
  <text class="d-cap" x="676" y="106">9</text>
  <text class="d-cap" x="676" y="134">4</text>
  <path class="d-rule" d="M700 44 L724 44 L724 128 L700 128"/>
  <text class="d-accent-cap" x="732" y="90">min = 4</text>
  <path class="d-rule" d="M0 176 L800 176"/>
  <text class="d-cap" x="0" y="198">COLLISIONS ONLY EVER OVER-COUNT, SO THE SMALLEST ROW IS THE TIGHTEST BOUND</text>
  <text class="d-cap" x="0" y="220">A DOORKEEPER FILTER ABSORBS THE LONG TAIL OF ONE-HIT KEYS BEFORE THEY REACH THE SKETCH</text>
  <text class="d-accent-cap" x="0" y="242">EVERY N INCREMENTS, ALL COUNTERS HALVE — THE SKETCH FORGETS, WHICH IS WHY IT STAYS USEFUL</text>
</svg>
</figure>

That estimate is only used for one decision. When the cache is full and a new item arrives, ARC
and LRU would admit it and evict something. TinyLFU compares the **candidate** against the
**victim** the eviction policy has chosen, and keeps whichever the sketch says is used more
often. A one-hit wonder loses that comparison and never gets in.

**W-TinyLFU** — the version people actually ship — puts a small LRU window in front, because
pure frequency admission is bad at bursts of genuinely new traffic:

<figure class="diagram">
<svg viewBox="0 0 800 230" role="img" aria-label="W-TinyLFU: a small admission window feeds a TinyLFU comparison, which decides whether a candidate enters the main segmented LRU cache.">
  <text class="d-cap" x="0" y="14">NEW REQUEST</text>
  <path class="d-rule" d="M0 34 L96 34"/>
  <path class="d-fill-rule" d="M96 30 l12 4 l-12 4 z"/>
  <rect class="d-box" x="112" y="18" width="150" height="52"/>
  <text class="d-key" x="126" y="42">WINDOW</text>
  <text class="d-cap" x="126" y="60">LRU · ~1% OF CACHE</text>
  <path class="d-rule" d="M262 44 L330 44"/>
  <path class="d-fill-rule" d="M330 40 l12 4 l-12 4 z"/>
  <text class="d-cap" x="266" y="34">EVICTED =</text>
  <text class="d-cap" x="266" y="64">CANDIDATE</text>
  <rect class="d-accent-box" x="346" y="8" width="180" height="72"/>
  <text class="d-accent-cap" x="360" y="32">TINYLFU</text>
  <text class="d-cap" x="360" y="52">CANDIDATE vs VICTIM</text>
  <text class="d-cap" x="360" y="70">HIGHER ESTIMATE WINS</text>
  <path class="d-rule" d="M526 44 L566 44"/><path class="d-fill-rule" d="M566 40 l12 4 l-12 4 z"/><text class="d-cap" x="528" y="34">ADMIT</text>
  <rect class="d-box" x="580" y="0" width="220" height="40"/>
  <text class="d-key" x="594" y="26">PROBATION</text>
  <rect class="d-box" x="580" y="48" width="220" height="40"/>
  <text class="d-key" x="594" y="74">PROTECTED</text>
  <text class="d-cap" x="580" y="106">MAIN CACHE · SLRU · ~99%</text>
  <path class="d-accent-line" d="M436 92 L436 128"/><path class="d-accent-fill" d="M436 134 l6 -12 l-12 0 z"/>
  <text class="d-cap" x="346" y="152">REJECTED — THE VICTIM STAYS</text>
  <path class="d-rule" d="M0 180 L800 180"/>
  <text class="d-cap" x="0" y="202">THE WINDOW EXISTS SO A BURST OF GENUINELY NEW KEYS CAN GET A HEARING</text>
  <text class="d-cap" x="0" y="222">CAFFEINE (JAVA) AND SEVERAL GO AND RUST CACHES SHIP THIS DESIGN</text>
</svg>
</figure>

**What it costs.** A handful of bits per tracked item and one sketch lookup per admission —
cheap enough that the paper's whole argument is that you get most of LFU's benefit for a rounding
error of memory. The aging step matters more than it looks: without periodic halving, the sketch
slowly becomes a record of history rather than of the present.

**Read it:** Gil Einziger, Roy Friedman and Ben Manes, *TinyLFU: A Highly Efficient Cache
Admission Policy* — [arxiv.org/abs/1512.00727](https://arxiv.org/abs/1512.00727). The extended
version appeared in ACM Transactions on Storage
([doi.org/10.1145/3149371](https://doi.org/10.1145/3149371)).

## 3. Scaling Memcache at Facebook — when the cache is the system

**The problem.** Everything above is about one cache in one process. At scale the cache is a
fleet, the failure modes are new, and none of them are about eviction policy.

**The mechanism.** The paper is a catalogue of specific fixes, and two are worth knowing by
heart.

**Thundering herds and stale sets.** A popular key expires. A thousand clients miss
simultaneously, a thousand identical queries hit the database, and — worse — a slow one can
finish last and write a *stale* value over a newer one. The fix is a **lease**: on a miss,
memcached hands exactly one client a token and makes the others wait briefly or take a slightly
stale value. A set is only accepted if its token is still valid.

<figure class="diagram"><svg viewBox="0 0 820 300" role="img" aria-label="A lease: on a miss the cache issues a token to one client, which alone refills the cache while the others wait or take a stale value."><text class="d-cap" x="0" y="46">CLIENT A</text><text class="d-cap" x="0" y="116">CLIENT B..N</text><text class="d-cap" x="0" y="186">MEMCACHED</text><text class="d-cap" x="0" y="256">DATABASE</text><path class="d-rule" d="M110 42 L820 42"/><path class="d-rule" d="M110 112 L820 112"/><path class="d-rule" d="M110 182 L820 182"/><path class="d-rule" d="M110 252 L820 252"/><path class="d-accent-line" d="M150 42 L150 176"/><path class="d-accent-fill" d="M150 182 l5 -11 l-10 0 z"/><text class="d-cap" x="158" y="76">GET · MISS</text><path class="d-accent-line" d="M268 182 L268 48"/><path class="d-accent-fill" d="M268 42 l5 11 l-10 0 z"/><text class="d-accent-cap" x="276" y="146">LEASE TOKEN</text><path class="d-rule" d="M392 112 L392 176"/><path class="d-fill-rule" d="M392 182 l5 -11 l-10 0 z"/><text class="d-cap" x="400" y="146">WAIT / STALE</text><path class="d-accent-line" d="M520 42 L520 246"/><path class="d-accent-fill" d="M520 252 l5 -11 l-10 0 z"/><text class="d-cap" x="528" y="216">ONE QUERY</text><path class="d-accent-line" d="M642 42 L642 176"/><path class="d-accent-fill" d="M642 182 l5 -11 l-10 0 z"/><text class="d-cap" x="650" y="76">SET · TOKEN</text><path class="d-rule" d="M760 182 L760 118"/><path class="d-fill-rule" d="M760 112 l5 11 l-10 0 z"/><text class="d-cap" x="700" y="146">SERVED</text><path class="d-rule" d="M0 278 L820 278"/><text class="d-cap" x="0" y="296">ONE CLIENT REFILLS · EVERYONE ELSE IS ANSWERED WITHOUT TOUCHING THE DATABASE</text></svg></figure>

**Invalidation is a data pipeline.** Rather than trusting every writer to remember to delete
its keys, invalidations are read out of the database commit log and broadcast by a dedicated
service. Correctness stops depending on application discipline, which is the sort of decision
that only looks obvious afterwards.

The paper also covers regional pools, the "gutter" pool that absorbs a failed server's traffic
so its load does not stampede the database, and why they moved bulk traffic to UDP for gets
while keeping TCP for sets.

**Read it:** Rajesh Nishtala et al., *Scaling Memcache at Facebook*, USENIX NSDI '13 —
[usenix.org/conference/nsdi13](https://www.usenix.org/conference/nsdi13/technical-sessions/presentation/nishtala).

## 4. S3-FIFO — the recent result that upsets the order

**The problem.** Twenty years of work on LRU variants assumed the list-reordering that LRU
requires. That reordering is also a lock, and locks are what stop a cache from scaling across
cores.

**The mechanism.** Three FIFO queues and a counter. No reordering at all.

<figure class="diagram">
<svg viewBox="0 0 800 250" role="img" aria-label="S3-FIFO: a small FIFO queue filters one-hit wonders into a ghost queue, while items seen more than once are promoted to a large main FIFO queue.">
  <text class="d-cap" x="0" y="14">NEW OBJECT</text>
  <path class="d-rule" d="M0 34 L92 34"/>
  <path class="d-fill-rule" d="M92 30 l12 4 l-12 4 z"/>
  <rect class="d-box" x="108" y="14" width="170" height="44"/>
  <text class="d-key" x="122" y="34">S — SMALL</text>
  <text class="d-cap" x="122" y="50">FIFO · 10% OF CACHE</text>
  <path class="d-accent-line" d="M278 36 L340 36"/><path class="d-accent-fill" d="M340 32 l12 4 l-12 4 z"/><text class="d-accent-cap" x="282" y="26">SEEN ≥ 2×</text>
  <rect class="d-box" x="356" y="0" width="240" height="72"/>
  <text class="d-key" x="370" y="28">M — MAIN</text>
  <text class="d-cap" x="370" y="46">FIFO · 90% OF CACHE</text>
  <text class="d-cap" x="370" y="64">REINSERTED ONCE IF USED AGAIN</text>
  <path class="d-rule" d="M182 58 L182 128"/>
  <path class="d-fill-rule" d="M182 134 l4 -12 l-8 0 z"/>
  <text class="d-cap" x="60" y="104">SEEN ONCE — EVICTED</text>
  <rect class="d-ghost" x="108" y="140" width="240" height="44"/>
  <text class="d-key" x="122" y="160">G — GHOST</text>
  <text class="d-cap" x="122" y="176">KEYS ONLY, NO DATA</text>
  <path class="d-accent-line" d="M348 174 L470 174 L470 78"/><path class="d-accent-fill" d="M470 72 l6 12 l-12 0 z"/><text class="d-accent-cap" x="356" y="150">REQUESTED AGAIN → STRAIGHT INTO M</text>
  <path class="d-rule" d="M0 210 L800 210"/>
  <text class="d-cap" x="0" y="232">NOTHING IS EVER REORDERED, SO NOTHING NEEDS A LOCK ON THE READ PATH</text>
</svg>
</figure>

Objects enter the small queue **S**. If they are never touched again they leave via **G**, the
ghost queue, having occupied only 10% of the cache on their way through. Objects touched again
are promoted to the main queue **M**. And an object that turns up while its key is still in the
ghost queue skips the probation entirely — it has now proven itself twice.

The result the paper reports is the interesting part: on a large corpus of production traces
this beats the LRU family on hit ratio, not merely on throughput. The mechanism doing the work
is the same one TinyLFU identified — most objects are one-hit wonders, and the cheapest way to
handle them is to give them a small room and a short lease.

**Read it:** Juncheng Yang, Yazhuo Zhang, Ziyue Qiu, Yao Yue and Rashmi Vinayak, *FIFO Queues
are All You Need for Cache Eviction*, ACM SOSP '23 —
[doi.org/10.1145/3600006.3613147](https://doi.org/10.1145/3600006.3613147). The authors keep an
overview and implementations at [s3fifo.com](https://s3fifo.com/).

## What the four have in common

Read in order they make one argument, which is not the argument any of them sets out to make.

ARC says the split between recency and frequency should be learned rather than configured.
TinyLFU says most of what you are deciding about does not deserve to be in the cache at all.
The memcache paper says that once there is more than one cache, your problems are coordination
problems wearing an eviction costume. And S3-FIFO says the expensive machinery we built to
express the first two ideas can mostly be replaced by a small queue and a counter.

The thing I take to work: **the highest-leverage decision in a cache is admission, and the
second is what you do on a miss.** Eviction policy is the part everyone argues about and the
part that matters least.

---

*If a link has moved, the title, authors and venue above are enough to find any of these — I
have preferred DOI and arXiv identifiers here for exactly that reason.*
