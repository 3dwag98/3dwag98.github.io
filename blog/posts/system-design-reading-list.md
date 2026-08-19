---
title: The system design research worth reading, and why
date: 2026-07-12
tags: [system-design, distributed-systems, reading]
summary: A short guide to the papers and references that actually changed how production systems get built — what each one contributed, and where to read it.
---

Most system design advice is downstream of about fifteen papers. Reading the originals is
faster than reading the hundredth summary of them, and it is usually more honest: the authors
tend to be explicit about what their design gives up, in a way that the blog posts about their
design are not.

This is the list I keep coming back to, grouped by the question each one answers.

## If you only read three

1. **[Designing Data-Intensive Applications](https://dataintensive.net/)** — Martin Kleppmann,
   2017. Not a paper, and the single best starting point. It is the map that makes the papers
   below legible, and it is unusually careful about the difference between what a system claims
   and what it guarantees.
2. **[The Log: what every software engineer should know about real-time data's unifying abstraction](https://engineering.linkedin.com/distributed-systems/log-what-every-software-engineer-should-know-about-real-time-datas-unifying-abstraction)**
   — Jay Kreps, 2013. The argument that an ordered, replayable log is the primitive underneath
   replication, stream processing and integration alike. It is why Kafka looks the way it does,
   and it reframes a lot of "how do these systems talk" problems into one problem.
3. **[The Amazon Builders' Library](https://aws.amazon.com/builders-library/)** — ongoing. The
   closest thing to an operations curriculum written by people who are on call. The pieces on
   timeouts and retries, on jitter, and on avoiding fallback are worth more than most
   architecture books.

## Ordering and time

**[Time, Clocks, and the Ordering of Events in a Distributed System](https://lamport.azurewebsites.net/pubs/time-clocks.pdf)**
— Leslie Lamport, 1978. The paper that established there is no global "now" to appeal to, and
gave us happened-before and logical clocks instead. Everything about causality in distributed
systems descends from it. It is nine pages.

**[Spanner: Google's Globally-Distributed Database](https://static.googleusercontent.com/media/research.google.com/en//archive/spanner-osdi2012.pdf)**
— Corbett et al., 2012. The counter-move: if you cannot have a global clock, buy one. TrueTime
exposes clock uncertainty as an interval and waits it out, which buys externally consistent
transactions across continents. The interesting part is that the uncertainty is in the API
rather than hidden.

## Agreement

**[Paxos Made Simple](https://lamport.azurewebsites.net/pubs/paxos-simple.pdf)** — Lamport,
2001. Consensus reduced to its core. Famously still not simple, which is the point of the next
one.

**[In Search of an Understandable Consensus Algorithm](https://raft.github.io/raft.pdf)** —
Ongaro and Ousterhout, 2014. Raft, designed explicitly for comprehensibility rather than
minimality — leader election, log replication and safety kept as separate ideas. If you are
going to implement or debug consensus, start here. The [raft.github.io](https://raft.github.io/)
visualisations are excellent.

## What you give up

**[Harvest, Yield, and Scalable Tolerant Systems](https://people.eecs.berkeley.edu/~brewer/cs262b/on-line-harvest-yield.pdf)**
— Fox and Brewer, 1999. Predates the CAP theorem's fame and is more useful than it. Instead of
a binary choice, it gives you two dials: *harvest* (how much of the data you answered from) and
*yield* (how often you answered at all). Degrading gracefully usually means trading harvest for
yield deliberately rather than falling over.

**[CAP Twelve Years Later: How the "Rules" Have Changed](https://www.infoq.com/articles/cap-twelve-years-later-how-the-rules-have-changed/)**
— Eric Brewer, 2012. Brewer walking back the popular reading of his own theorem. Partitions are
rare, the choice is not global, and the interesting design work is in what you do *during* a
partition and how you recover afterwards.

**[Please stop calling databases CP or AP](https://martin.kleppmann.com/2015/05/11/please-stop-calling-databases-cp-or-ap.html)**
— Kleppmann, 2015. The short, blunt version of why the two-letter labels mislead.

## Building blocks

**[Dynamo: Amazon's Highly Available Key-value Store](https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf)**
— DeCandia et al., 2007. Consistent hashing, sloppy quorums, hinted handoff, vector clocks, and
an explicit decision to push conflict resolution to the application. Its influence on the
generation of stores that followed is hard to overstate. Read it alongside the CAP pieces
above.

**[The Google File System](https://static.googleusercontent.com/media/research.google.com/en//archive/gfs-sosp2003.pdf)**
(2003), **[MapReduce](https://static.googleusercontent.com/media/research.google.com/en//archive/mapreduce-osdi04.pdf)**
(2004) and **[Bigtable](https://static.googleusercontent.com/media/research.google.com/en//archive/bigtable-osdi06.pdf)**
(2006) — the three that started the modern data stack. What holds up is not the systems but the
method: design for the failure rate and access pattern you actually have, not the general case.

## Where the theory meets an on-call rotation

**[A Note on Distributed Computing](https://scholar.harvard.edu/files/waldo/files/waldo-94.pdf)**
— Waldo, Wyant, Wollrath and Kendall, 1994. The argument against pretending a network call is a
local call. Every framework that has tried to hide the network since has rediscovered this the
hard way, and it is the paper I would hand to anyone reaching for a transparent RPC
abstraction.

**[Site Reliability Engineering](https://sre.google/sre-book/table-of-contents/)** — Google,
2016, free online. Error budgets, SLOs and the organisational argument that reliability is a
product decision rather than a virtue. The chapters on overload and cascading failure are the
practical companion to everything above.

**[Jepsen](https://jepsen.io/analyses)** — Kyle Kingsbury, ongoing. Databases tested against
their own consistency claims, with the results written up in detail. Reading a few analyses is
the fastest cure for taking a marketing page at its word.

**[Marc Brooker's blog](https://brooker.co.za/blog/)** — ongoing. Consistently the clearest
current writing on queueing, retries, timeouts and the arithmetic of scale.

---

Two habits make this list worth more than the sum of its links. Read the *evaluation* section,
where the honest limitations live. And when a paper describes a trade-off, write down which side
your own system is on — that sentence is usually the design doc you were avoiding writing.
