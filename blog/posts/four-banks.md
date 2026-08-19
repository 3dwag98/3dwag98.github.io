---
title: Built, shipped, still running
date: 2026-08-19
tags: [platform-engineering, full-stack, spring-boot, kubernetes]
summary: The portfolio gives each role one line. This is the detail behind those lines — seven years across four banks, what the systems actually were, and what each one taught me.
---

The front page of this site gives each role a single claim, because a claim is what a
stranger can read in four seconds. This is the version with the detail put back in: what
the systems actually were, what was hard about them, and what I would tell someone
starting the same job.

## JPMorgan Chase & Co. — SDE 2, Jul 2026 to present

**Core trading platforms for Asset Management.** The services that carry the flow, the
data model underneath them, and the screens the desk works in. Scalable, resilient and
fast, engineered to stay that way as volume grows.

The interesting constraint is that the platform cannot stop trading. Modernization here
is not a rewrite with a cutover weekend; it is delivering real capability every quarter
while the system underneath is replaced piece by piece. The craft is in making that swap
*invisible* to the people using it — a desk should never be able to tell you which
quarter their screen started talking to a new service.

I have been here a short time. Ask me again in a year and this section will be the
longest one.

## Barclays — Software Engineer BA4, Aug 2022 to Jul 2026

Four years, and the part of my career I would point at first.

### A control plane for the whole estate

Global job scheduling ran through legacy command-line tools that could not grow. I
designed and built the replacement: a highly available Spring Boot service behind one
REST API, with a multi-constraint authorization layer over a **Redis cache-aside**
pattern and circuit breakers holding the edges.

<figure class="diagram">
<svg viewBox="0 0 800 250" role="img" aria-label="One REST API in front of an authorization layer backed by a Redis cache-aside, with a circuit breaker between the cache and the source of truth, replacing a row of legacy command-line tools.">
  <text class="d-cap" x="0" y="14">BEFORE — ONE TOOL PER TEAM</text>
  <rect class="d-ghost" x="0" y="26" width="86" height="34"/>
  <rect class="d-ghost" x="96" y="26" width="86" height="34"/>
  <rect class="d-ghost" x="192" y="26" width="86" height="34"/>
  <text class="d-cap" x="288" y="48">CLI, PER TEAM, UNGROWABLE</text>
  <path class="d-rule" d="M0 84 L800 84"/>
  <text class="d-accent-cap" x="0" y="106">AFTER — ONE API</text>
  <rect class="d-accent-box" x="0" y="120" width="150" height="56"/>
  <text class="d-key" x="18" y="154">REST API</text>
  <path class="d-accent-line" d="M150 148 L214 148"/>
  <path class="d-accent-fill" d="M220 148 l-11 5 l0 -10 z"/>
  <rect class="d-box" x="226" y="120" width="164" height="56"/>
  <text class="d-key" x="242" y="146">AUTHZ</text>
  <text class="d-cap" x="242" y="166">MULTI-CONSTRAINT</text>
  <path class="d-accent-line" d="M390 148 L454 148"/>
  <path class="d-accent-fill" d="M460 148 l-11 5 l0 -10 z"/>
  <rect class="d-box" x="466" y="120" width="140" height="56"/>
  <text class="d-key" x="482" y="146">REDIS</text>
  <text class="d-cap" x="482" y="166">CACHE-ASIDE</text>
  <path class="d-rule" d="M606 148 L660 148"/>
  <text class="d-accent-cap" x="612" y="138">BREAKER</text>
  <path class="d-accent-line" d="M666 130 L666 166"/>
  <rect class="d-box" x="682" y="120" width="118" height="56"/>
  <text class="d-key" x="698" y="154">SOURCE</text>
  <path class="d-rule" d="M0 206 L800 206"/>
  <text class="d-cap" x="0" y="228">A HANDFUL OF OPERATORS AT LAUNCH — THEN THE WAY AN ENTIRE ESTATE IS SCHEDULED</text>
</svg>
</figure>

It went from a handful of operators to being the way an entire estate is scheduled —
which is the only test of an interface that matters. Nobody adopts a platform because
the internals are elegant. They adopt it because the API said what it would do and then
did that.

### Moving events at volume

An enrichment and preprocessing engine in Python and Nginx with dynamic, schema-driven
routing, built to take enterprise alert traffic and place each event where it belongs the
moment it arrives rather than several hops later.

Schema-driven is the load-bearing word. Routing rules as configuration rather than code
meant a new event type was a config change, not a release — and that is the difference
between a pipeline teams wait on and one they use.

### Products, not scripts

Credential rotation, maintenance suppression and resource onboarding were manual rituals.
Each became a product with a front end and an API:

- **Vault-driven restarts** across OpenShift, so rotating a credential stopped being a
  change request
- **Maintenance-aware suppression**, so planned work stopped generating noise somebody
  had to explain the next morning
- An **Angular and Django onboarding platform** wired into ServiceNow over events

None of these were interesting problems in the algorithmic sense. All of them were
somebody's Tuesday afternoon, every week, forever.

### What four years taught me

Building for other engineers is its own discipline. *The interface is the product* — a
clear API with honest semantics carries more weight than any amount of internal
cleverness, and it is what lets a platform keep growing after you stop touching it.

## BNP Paribas — DevOps Engineer, Jan 2022 to Jun 2022

Short stint, narrow brief, and useful precisely because it was narrow.

**Making room to grow.** Moved deployments onto Kubernetes and OpenShift and gave them
room to scale horizontally through peak volume, instead of scaling by hand at the worst
possible hour.

**Delivery as a product.** Standardized environments in Ansible, wrote collections that
took secret handling out of human hands, and moved quality and security gates into the
pipeline ahead of review. Shipping became something the team could do on any given
afternoon rather than an event that needed a plan.

The lesson I took: if deploying is scary, every other engineering decision bends around
that fear. You start batching changes, and batched changes are how small mistakes arrive
in groups.

## Capgemini — Senior Analyst, Jun 2019 to Dec 2021

Where the full stack habit started.

RESTful services in Django and Flask, the case for splitting a monolith into pieces that
could be deployed separately, and the React and Angular front ends that consumed them —
usually written by the same person, which is where the habit comes from.

**The lesson.** A backend nobody can see is a backend nobody can fix. Building the
dashboards as well as the services taught me to design the API around the thing someone
eventually has to look at. It is very easy to ship a technically correct endpoint that
makes the screen in front of it impossible to build well.

## The thread

Reading it back, the same shape keeps recurring: something manual and fragile that people
had learned to work around, turned into something with an interface and a contract. The
technology changes — CLI to REST, hand-scaled to Kubernetes, scripts to products — but
the move is the same one, and it is still the move I look for first.
