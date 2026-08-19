---
title: Why these notes exist
date: 2026-07-12
tags: [meta, engineering]
summary: Writing the thing down is how I find out whether I actually understood it.
---

Most of what I know about building software at scale, I learned twice. Once badly, in
production, and once properly — months later, writing it out for somebody else.

That gap is the reason this page exists.

## The argument that closes

A design that cannot survive a written paragraph usually cannot survive a load test either.
Prose is unforgiving in a way a diagram is not: you can draw a box labelled *cache* and move on,
but the moment you have to write "and when the cache is unavailable, the service does X" you
discover whether X was ever decided.

I have killed more of my own bad ideas at the keyboard than in review. That is not a criticism
of review. It is that by the time something reaches review, I have usually already talked myself
into it.

## What ends up here

Working notes, mostly. The kind of thing I would put in a design doc or a post-incident write-up,
cleaned up enough to be useful to someone outside the team:

- Decisions that spanned layers, where the interesting part was the seam.
- Patterns that survived contact with production, and the ones that did not.
- Trade-offs I got wrong the first time, described as I actually got them wrong.

No tutorials. There is no shortage of those, and I am rarely the right person to write one.

## Why publish rather than keep a folder

Three reasons, in the order they actually matter to me.

1. **It compounds.** The caching decision I explained badly in 2023 is the one I explain in
   thirty seconds now, because I had to write it out once and find the words.
2. **It is a record.** Six months later, "why did we do it this way?" has an answer that is not
   a Slack thread nobody can find.
3. **Someone else has this problem.** Not the general version — the specific, annoying,
   Tuesday-afternoon version. Those are the write-ups I have been most grateful to find.

If something here saves a person an afternoon, it earned its place.
