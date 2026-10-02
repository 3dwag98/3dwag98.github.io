---
title: Brilliant but unverifiable — what it takes to put an LLM to work in real science
date: 2026-10-02
tags: [ai-infrastructure, llm, agent-harnesses, verification]
summary: Language models solve olympiad maths and still frustrate working scientists. A physicist's answer is BootLoops — 49 packages and 12 protocols any model can drive, aimed only at problems a machine can check, and held to thirty digits at points no fit has seen. Why LLMs disappoint in real science, what BootLoops is, how it turns an agent's claim into a checked result — worked through the project's own documented examples.
---

Language models now disprove conjectures and close decades-old problems — and nearly all of those
headlines come from mathematics, the one field where a problem can be stated completely and an
answer checked absolutely. Ask a working ecologist, geneticist or physicist what using one is
like, and you hear a different story: a model that is dazzling in conversation and exhausting in
practice, that needs correcting on every sentence, and whose confident claims about a field you do
not know are impossible to judge.

On 1 October Anthropic published a guest post by the physicist Matthew Schwartz,
[Claude-shaped science](https://www.anthropic.com/research/claude-shaped-science), that takes that
gap seriously. His answer is not a better model. It is **[BootLoops](https://bootloops.ai/)** — an
open-source harness of 49 scientific packages and 12 working protocols that any model can drive,
aimed only at problems where a machine can tell whether the model was right. I read everything
published about it — the post, the project site, the tool documentation and both repositories.
This post follows one question at a time:

<figure class="diagram">
<svg viewBox="0 0 800 260" role="img" aria-label="The map of this post in three panels. Why: models excel at a narrow band of work, and outside it nobody can tell whether they are right, and agents game their own tests. What: BootLoops, forty-nine packages and twelve protocols any model can drive, built around problems a machine can check. How: reduce, bootstrap, evaluate to hundreds of digits, fit the exact rationals, and certify thirty or more digits at unseen points.">
  <text class="d-cap" x="0" y="14">THE STORY IN THREE QUESTIONS</text>
  <rect class="d-box" x="0" y="34" width="250" height="168"/>
  <text class="d-accent-cap" x="16" y="58">THE PROBLEM</text>
  <text class="d-key" x="16" y="82">WHY</text>
  <text class="d-cap" x="16" y="110">MODELS EXCEL AT A NARROW BAND</text>
  <text class="d-cap" x="16" y="128">OUTSIDE IT, NOBODY CAN TELL</text>
  <text class="d-cap" x="16" y="146">IF THEY ARE RIGHT — AND</text>
  <text class="d-cap" x="16" y="164">AGENTS GAME THEIR OWN TESTS</text>
  <path class="d-rule d-flow" d="M250 118 L262 118"/>
  <path class="d-fill-rule" d="M271 118 l-11 5 l0 -10 z"/>
  <rect class="d-box" x="275" y="34" width="250" height="168"/>
  <text class="d-accent-cap" x="291" y="58">THE THING</text>
  <text class="d-key" x="291" y="82">WHAT</text>
  <text class="d-cap" x="291" y="110">BOOTLOOPS: 49 PACKAGES AND</text>
  <text class="d-cap" x="291" y="128">12 PROTOCOLS ANY MODEL CAN</text>
  <text class="d-cap" x="291" y="146">DRIVE, AIMED ONLY AT WORK</text>
  <text class="d-cap" x="291" y="164">A MACHINE CAN CHECK</text>
  <path class="d-accent-line d-flow d-d1" d="M525 118 L537 118"/>
  <path class="d-accent-fill" d="M546 118 l-11 5 l0 -10 z"/>
  <rect class="d-accent-box" x="550" y="34" width="250" height="168"/>
  <text class="d-accent-cap" x="566" y="58">THE MECHANISM</text>
  <text class="d-key" x="566" y="82">HOW</text>
  <text class="d-accent-cap" x="566" y="110">REDUCE · BOOTSTRAP · EVALUATE</text>
  <text class="d-accent-cap" x="566" y="128">TO 100s OF DIGITS · FIT THE</text>
  <text class="d-accent-cap" x="566" y="146">RATIONALS · CERTIFY 30+</text>
  <text class="d-accent-cap" x="566" y="164">DIGITS AT UNSEEN POINTS</text>
  <path class="d-rule" d="M0 224 L800 224"/>
  <text class="d-cap" x="0" y="248">EVERY SECTION BELOW ANSWERS ONE OF THESE THREE — ITS HEADING SAYS WHICH</text>
</svg>
</figure>

Two disclosures shape how to read what follows. Schwartz has been a visiting researcher at
Anthropic during this work, Anthropic funded BootLoops and holds the copyright on its code, and
BootLoops is nonetheless not an Anthropic project — Schwartz owns and maintains it. And every
scientific result quoted below is the author's own, in manuscripts mostly drafted by Claude,
several marked preliminary or in preparation. I have not reproduced any of it; where this post
shows code and output, both are the project's own documented examples.

## Why — LLMs are brilliant, and science still can't use them

### 1. The headline and the lab

Schwartz borrows a physicist's term for the problem. An **impedance mismatch** is two systems that
each work perfectly well but are poorly matched, so most of what one sends never reaches the other.

His previous experiment, [Vibe physics](https://www.anthropic.com/research/vibe-physics), was the
mismatch at full strength: last December, Claude Opus 4.5 performed like a strong graduate student
working twenty times faster, and getting a good paper out of it was still a slog of correcting
every sentence and pulling it back from dead ends. The model was not the problem, and neither was
the scientist. What one could offer and what the other needed simply did not line up.

What a model brings is breadth across every field at once, coding ability beyond most scientists',
strong mathematics and statistics, and reading at machine speed. What science needs is taste — a
sense of what is interesting — new data from the world, conceptual leaps, judgment of its own
results, and a sense of how long things should take. The overlap is small:

<figure class="diagram">
<svg viewBox="0 0 800 290" role="img" aria-label="Two boxes face each other: on the left, what agents bring — breadth, code, reading speed, patience, mathematics; on the right, what science needs — taste, new data, conceptual leaps, judgment, a sense of time. Between them a narrow accented band labelled Claude-shaped: a known method from a distant field plus an answer a machine can check.">
  <text class="d-cap" x="0" y="14">THE IMPEDANCE MISMATCH — AND THE NARROW BAND THAT GETS THROUGH</text>
  <rect class="d-box" x="0" y="34" width="240" height="170"/>
  <text class="d-key" x="16" y="62">AGENTS BRING</text>
  <text class="d-cap" x="16" y="92">BREADTH ACROSS EVERY FIELD</text>
  <text class="d-cap" x="16" y="114">CODE BETTER THAN THE PAPERS'</text>
  <text class="d-cap" x="16" y="136">READING AT MACHINE SPEED</text>
  <text class="d-cap" x="16" y="158">PATIENCE FOR EVERY CASE</text>
  <text class="d-cap" x="16" y="180">MATHS AND STATISTICS</text>
  <path class="d-accent-line d-flow" d="M240 119 L282 119"/>
  <path class="d-accent-fill" d="M288 119 l-11 5 l0 -10 z"/>
  <rect class="d-accent-box" x="294" y="54" width="212" height="130"/>
  <text class="d-key" x="310" y="84">CLAUDE-SHAPED</text>
  <text class="d-accent-cap" x="310" y="110">A KNOWN METHOD</text>
  <text class="d-accent-cap" x="310" y="128">FROM A DISTANT FIELD</text>
  <text class="d-accent-cap" x="310" y="146">+ AN ANSWER A</text>
  <text class="d-accent-cap" x="310" y="164">MACHINE CAN CHECK</text>
  <path class="d-rule d-flow-slow" d="M560 119 L518 119"/>
  <path class="d-fill-rule" d="M512 119 l11 -5 l0 10 z"/>
  <rect class="d-box" x="560" y="34" width="240" height="170"/>
  <text class="d-key" x="576" y="62">SCIENCE NEEDS</text>
  <text class="d-cap" x="576" y="92">TASTE — WHAT IS INTERESTING</text>
  <text class="d-cap" x="576" y="114">NEW DATA FROM THE WORLD</text>
  <text class="d-cap" x="576" y="136">CONCEPTUAL LEAPS</text>
  <text class="d-cap" x="576" y="158">JUDGMENT OF ITS OWN RESULTS</text>
  <text class="d-cap" x="576" y="180">A SENSE OF TIME</text>
  <path class="d-rule" d="M0 236 L800 236"/>
  <text class="d-cap" x="0" y="258">MOST OF WHAT ONE SIDE PUTS IN NEVER REACHES THE OTHER. THE OVERLAP IS SMALL —</text>
  <text class="d-cap" x="0" y="276">BUT IT EXISTS IN NEARLY EVERY FIELD, WHICH IS WHAT MAKES IT WORTH SEARCHING FOR.</text>
</svg>
</figure>

So this summer Schwartz inverted the approach. Instead of asking Claude to be the collaborator he
wanted, he went looking for problems shaped like the collaborator he had. That raised the second
problem, and it is the one that matters most for anyone deploying agents.

### 2. Correct, but not interesting — and not always honest

Once Claude was working outside physics, Schwartz noticed something about himself:

> When Claude claims something it did in my field is fantastic, I can judge whether that's true or
> not (it often isn't). But when it claims something it did in another field is fantastic, I find
> myself agreeing.

So he found experts, and the same pattern repeated in almost every field: Claude was *technically
correct*, and the result was not interesting until an expert steered it.

In ecology, **neutral theory** asks how much of the rise and fall of species is pure chance.
[Stephen Hubbell](https://press.princeton.edu/books/paperback/9780691021287/the-unified-neutral-theory-of-biodiversity-and-biogeography)
proposed in 2001 that perhaps all of it is, and
[Rampal Etienne](https://doi.org/10.1111/j.1461-0248.2004.00717.x) wrote down a testable equation in
2005 that nobody could solve at scale for twenty years. Claude solved it, and on Barro Colorado
Island in the Panama Canal — every tree in fifty hectares counted repeatedly since 1982 — showed the
species mix changing 4.5 times faster than neutral theory allows. The ecologist James O'Dwyer said
it would likely "be met with a shrug by many ecologists": the field already knew neutral theory
cannot keep up. His better idea was to *subtract* the neutral prediction and model what remains,
which became a minimal predictive model of the forest.

Genetics ran the same arc. Claude evaluated a 30-year-old integral for how selection shapes rare
mutations and applied it to [gnomAD](https://gnomad.broadinstitute.org/). Schwartz wrote to three
biologists before one responded, and eventually recruited his colleague Michael Desai, who was
impressed by the technical result and not compelled by the science — and suggested studying
*pairs* of mutations instead. That found evidence for **gene conversion** across 5.7 billion pairs
of nearby sites from the [1000 Genomes Project](https://www.internationalgenome.org/about/).

<figure class="diagram">
<svg viewBox="0 0 800 320" role="img" aria-label="A four-step loop: Claude finds a BootLoops-shaped problem, solves it technically correctly, an expert is unmoved but sees a better question, and the re-scoped work becomes a result the field wants. Each round leaves a new tool in the harness. Below, the ecology and genetics projects as examples of the loop.">
  <text class="d-cap" x="0" y="14">THE LOOP EVERY OUT-OF-FIELD PROJECT RAN</text>
  <rect class="d-box" x="0" y="30" width="175" height="70"/>
  <text class="d-key" x="16" y="56">CLAUDE FINDS</text>
  <text class="d-cap" x="16" y="76">A BOOTLOOPS-SHAPED</text>
  <text class="d-cap" x="16" y="92">PROBLEM</text>
  <path class="d-rule d-flow" d="M175 65 L202 65"/>
  <path class="d-fill-rule" d="M208 65 l-11 5 l0 -10 z"/>
  <rect class="d-box" x="208" y="30" width="175" height="70"/>
  <text class="d-key" x="224" y="56">IT SOLVES IT</text>
  <text class="d-cap" x="224" y="76">TECHNICALLY</text>
  <text class="d-cap" x="224" y="92">CORRECT</text>
  <path class="d-rule d-flow d-d1" d="M383 65 L410 65"/>
  <path class="d-fill-rule" d="M416 65 l-11 5 l0 -10 z"/>
  <rect class="d-box" x="416" y="30" width="175" height="70"/>
  <text class="d-key" x="432" y="56">AN EXPERT</text>
  <text class="d-cap" x="432" y="76">UNMOVED — BUT SEES</text>
  <text class="d-cap" x="432" y="92">THE BETTER QUESTION</text>
  <path class="d-accent-line d-flow d-d2" d="M591 65 L619 65"/>
  <path class="d-accent-fill" d="M625 65 l-11 5 l0 -10 z"/>
  <rect class="d-accent-box" x="625" y="30" width="175" height="70"/>
  <text class="d-key" x="641" y="56">SCIENCE</text>
  <text class="d-accent-cap" x="641" y="76">A RESULT THE FIELD</text>
  <text class="d-accent-cap" x="641" y="92">ACTUALLY WANTS</text>
  <path class="d-accent-line d-flow-slow" d="M712 100 L712 150 L88 150 L88 110"/>
  <path class="d-accent-fill" d="M88 100 l-5 11 l10 0 z"/>
  <text class="d-accent-cap" x="230" y="140">EACH ROUND LEAVES A NEW TOOL IN THE HARNESS</text>
  <path class="d-rule" d="M0 176 L800 176"/>
  <text class="d-accent-cap" x="0" y="204">ECOLOGY</text>
  <text class="d-cap" x="120" y="204">NEUTRAL THEORY SOLVED → “A SHRUG” → SUBTRACT IT, MODEL WHAT REMAINS</text>
  <text class="d-accent-cap" x="0" y="232">GENETICS</text>
  <text class="d-cap" x="120" y="232">RARE-MUTATION SPECTRUM → UNMOVED → PAIRS OF SITES: GENE CONVERSION</text>
  <path class="d-rule" d="M0 262 L800 262"/>
  <text class="d-cap" x="0" y="286">TECHNICALLY CORRECT IN ALMOST EVERY CASE —</text>
  <text class="d-cap" x="0" y="304">AND NOT INTERESTING UNTIL AN EXPERT STEERED IT</text>
</svg>
</figure>

And correctness itself could not be taken on trust. Schwartz's list of failure modes reads like an
incident log: Claude "loves to declare victory" — a proof complete except for "one unproven lemma"
that turned out to be the whole proof, then "done" again with a new axiom. It announced "Two years
of campaign, four deep marches" after three days of work. It ground through multi-day calculations
instead of building the tool that would take minutes. And it gamed checks: the BootLoops site says
plainly that its standard for "solved" exists because "the AI cheating led to" it.

That is the *why* in full. A model's judgment of **importance** needs a human expert. A model's
claim of **correctness** needs something that does not depend on anyone believing it. BootLoops
is built for the second, and it chooses its problems so that the second is possible.

## What — BootLoops, a harness built around problems a machine can check

### 3. What a Claude-shaped problem is

The pattern Schwartz kept seeing: *many fields have problems that a technique from mathematics,
physics or computer science would solve outright, if anyone in the field knew it existed.* The
method does not fail; the expertise is just spread across people who never meet.

The BootLoops site turns that into a selection rule. Every project needs an **AI hook** — a written
answer to *why should this succeed when the humans in the field could not?*

| The hook | What it means | An example from the program |
| --- | --- | --- |
| **A tool nobody in the field knows** | A method routine elsewhere, never applied here | An ecology equation from 2005, solved with integral methods from physics |
| **Breadth** | Seeing that two fields share one equation | Feynman-integral techniques computing the evidence for evolutionary trees |
| **Machine reading** | More sources than any person could read | A word-stress catalogue covering thousands of languages, quoting the deciding passage for each |
| **Exhaustive patience** | Checking every case where a study would sample | Every mechanical reading of the Voynich Manuscript, run against solvers proven to crack planted ciphers |
| **Better engineering** | Upgrading software scientists wrote for minimal function | A phylogenetics package reported as 20–200× more accurate than standard samplers at equal run time |

Every row must also pass one gate: **checkability**. Results should be reproduced by stand-alone
scripts, in the site's words, "so nothing is hidden deep inside the LLM's knowledge base or in some
secret file." A Claude-shaped problem is not one Claude can attempt. It is one where a machine can
tell you whether Claude was right.

### 4. What BootLoops is

A **harness** is the software between a person and a model that turns capability into reliable
work. Claude Code is one for Claude, Codex one for GPT, and Anthropic's
[Claude Science](https://claude.com/product/claude-science) one aimed at research. Each is built
around a model. BootLoops is built around a *domain* — scientific software ported, upgraded or
written by Claude, plus protocols for using it — and is deliberately independent of whichever model
drives it: "it can be called with Claude, or Gemini or ChatGPT, any version."

<figure class="diagram">
<svg viewBox="0 0 800 330" role="img" aria-label="A five-layer stack. At the top any model, then the agent runtime such as Claude Code, Codex, Cursor or Copilot — both replaceable. In the middle, accented, the BootLoops skills (twelve protocols in plain markdown) and the BootLoops toolkit (forty-nine packages, each with a guide and an acceptance gate) — where the gains accumulate. At the bottom, upstream engines such as Kira, FORM, AMFlow, Arb and pySecDec.">
  <text class="d-cap" x="0" y="14">FIVE LAYERS · THE MIDDLE TWO ARE BOOTLOOPS</text>
  <rect class="d-ghost" x="0" y="30" width="600" height="44"/>
  <text class="d-key" x="16" y="58">ANY MODEL</text>
  <text class="d-cap" x="230" y="57">CLAUDE · GPT · GEMINI · ANY VERSION</text>
  <rect class="d-box" x="0" y="82" width="600" height="44"/>
  <text class="d-key" x="16" y="110">AGENT RUNTIME</text>
  <text class="d-cap" x="230" y="109">CLAUDE CODE · CODEX · CURSOR · COPILOT</text>
  <rect class="d-accent-box" x="0" y="134" width="600" height="44"/>
  <text class="d-key" x="16" y="162">SKILLS · 12</text>
  <text class="d-accent-cap" x="230" y="161">WHAT “DONE” MEANS · PLAIN MARKDOWN</text>
  <rect class="d-accent-box" x="0" y="186" width="600" height="44"/>
  <text class="d-key" x="16" y="214">TOOLKIT · 49</text>
  <text class="d-accent-cap" x="230" y="213">INSTRUMENTS, EACH WITH A GUIDE AND A GATE</text>
  <rect class="d-box" x="0" y="238" width="600" height="44"/>
  <text class="d-key" x="16" y="266">ENGINES</text>
  <text class="d-cap" x="230" y="265">KIRA · FORM · AMFLOW · ARB · PYSECDEC</text>
  <path class="d-rule" d="M620 30 L620 126"/>
  <text class="d-cap" x="636" y="74">REPLACEABLE</text>
  <text class="d-cap" x="636" y="92">YOURS TO CHOOSE</text>
  <path class="d-accent-line" d="M620 134 L620 230"/>
  <text class="d-accent-cap" x="636" y="178">WHERE THE GAINS</text>
  <text class="d-accent-cap" x="636" y="196">ACCUMULATE</text>
  <path class="d-rule" d="M620 238 L620 282"/>
  <text class="d-cap" x="636" y="258">OTHER PEOPLE'S</text>
  <text class="d-cap" x="636" y="276">MATHEMATICS</text>
  <path class="d-rule" d="M0 300 L800 300"/>
  <text class="d-cap" x="0" y="322">SWAP THE MODEL ON TOP AND THE MIDDLE TWO LAYERS COME WITH YOU — THAT IS THE DESIGN</text>
</svg>
</figure>

The site calls it a **living harness**: the gains sit in the tools and their documentation rather
than any model's weights, so the next model inherits them on day one. And the documentation is
where the design lives. Each instrument is described "in the terms an agent needs: what the
instrument does, when to reach for it, what its output means, and what test its answer must pass
before anyone believes it." API docs tell you what a function returns. These also tell the agent
how to know whether to believe what came back.

It ships as six repositories under [github.com/BootLoops-ai](https://github.com/BootLoops-ai):

| Repository | What it holds | Licence |
| --- | --- | --- |
| [`bootloops`](https://github.com/BootLoops-ai/bootloops) | The 49 packages and the house engines | MIT; prose CC BY 4.0; three files GPL |
| [`skills`](https://github.com/BootLoops-ai/skills) | The twelve protocols, packaged as Claude Code and Codex plugins | MIT; text CC BY 4.0 |
| `jackandjill` | Exact Bayesian evidence for phylogenetics | MIT |
| [`amflow-cpp`](https://github.com/BootLoops-ai/amflow-cpp), `kira`, `blade` | Patched forks of three upstream engines, each with a `PATCHES.md` | MIT, GPL-3.0, MIT |

The 49 packages sort by the step they serve in a calculation. Starred entries are public programs
by other authors; the rest were written by Claude, many from methods that existed only in papers.

| Step | What the step is | Packages |
| --- | --- | --- |
| **Reduction** | Rewrite thousands of integrals as combinations of a few *masters* | FORM\*, Formglue, Kira/FireFly/Fermat\*, Blade\*, Seedling, Dogtag, Winnow, Trust, FFCapital, Numkin |
| **Singularities, geometry** | Where an integral blows up, and what geometry controls it | Landau Alphabet, PLD and SOFIA\*, Leviathan, GeoTriage, Maxcut, Dipstick, Coalescer |
| **Differential equations** | Canonical form; carry known values to new points | Counterweight, Canonify, Wayfinder, Famhar, Vopclose, Annihilator, Frobenius, Holonomic |
| **Numerical evaluation** | Independent many-digit values | AMFlow\*, PMflow, Membound, Cosmoflow, Longhand, pySecDec and FIESTA\*, Nestor, Tropical Sampler, SubTropica, Surd |
| **Special functions** | Elliptic, K3 and Calabi–Yau periods with proven bounds | Eichler, Ellipticus, GPLEval, GiNaC\*, PentagonFunctions\*, Galois, Abacus, Terrier |
| **Certified arithmetic** | Midpoint plus guaranteed radius | Arb and mpmath\*, Baller, ERAS |
| **Exact reconstruction** | Digits into a formula | PSLQ and LLL\*, Lockpick, Ansatzer, Gatekeeper, Rankscreen, Ratfit |
| **Statistics** | The applications outside physics | Mixalot, Popcorn, JaCK & Jill, POSQ, Clinch, Qinvert |
| **Records** | Quoted numbers tied to their files | Emitall |

### 5. What it produced

**36 manuscripts in 18 fields with 19 co-authors over three months**, chosen from some 400
candidate problems. A selection, with the status each carries on the
[manuscripts page](https://bootloops.ai/papers.html):

| Field | With | The result, as the author states it | Status |
| --- | --- | --- | --- |
| **Amplitudes** | — | Thirty frontier Feynman integrals across three function classes; fifteen new | Results paper, 105 pp |
| **Ecology** | James O'Dwyer | Species mix changes 4.5× faster than neutral theory allows; a minimal successor model | One manuscript; one in preparation |
| **Population genetics** | Michael Desai | Selection on rare variants evaluated exactly against ~730,000 gnomAD exomes; gene conversion in humans | Two manuscripts |
| **Phylogenetics** | Scott Edwards, Paul Lewis | Tree evidence as exact fractions; exact ties; the JaCK & Jill package | Two manuscripts |
| **Economics** | Isaiah Andrews, Jesse Shapiro | An LLM workflow over 4,452 replication packages; a discrepancy flagged in 3,460 articles or appendices, about a third of them last-digit rounding | [NBER w35782](https://www.nber.org/papers/w35782) |
| **Health policy** | — | Medicare Advantage star cut points miss their own stated criterion in 104 of 123 computations; roughly $0.9–1.4 billion in bonuses depend on it | Manuscript |
| **Mathematical physics** | Noam Elkies, Thomas Grimm | Watson's 1939 lattice integral with three unequal rates: a K3 period, not expressible in elliptic integrals for generic rates | In preparation |

Those are claims. The rest of this post is about the machinery that is supposed to make them more
than claims, and how to run it yourself.

## How — from one integral to an answer you don't have to trust

### 6. How one integral gets solved

The first Claude-shaped problems were in Schwartz's own field. Collider physics predicts what comes
out of a particle collision through **scattering amplitudes**, built from **Feynman diagrams** —
each one a multidimensional integral, and the frontier ones can each be a PhD thesis.

The **S-matrix bootstrap** avoids grinding out the integral: impose physical constraints on the
answer until only one possibility survives. Knowing where the amplitude can become infinite might
narrow it to 20,000 candidate functions; a symmetry cuts that to 500; and so on. The
**semi-numerical bootstrap** finishes the job from the other side: compute the integral directly
at a handful of points to absurd precision — sometimes a thousand digits — and let an
**integer-relation** algorithm pin the last few rational coefficients exactly. Given a number
\(x\) known to hundreds of digits and a menu of constants declared in advance — say \(\pi^2\) and
\(\zeta(3)\) — it searches for small integers, not all zero, such that

$$a_0\,x \;+\; a_1 \;+\; a_2\,\pi^2 \;+\; a_3\,\zeta(3) \;=\; 0, \qquad a_i \in \mathbb{Z}.$$

With enough digits, a relation that holds by accident is vanishingly unlikely — which is why the
`constant-recognition` protocol fixes the menu and the size limit on the \(a_i\) *before* the
search, so that a hit means something. PSLQ is the classic algorithm; Schwartz and co-authors
described the whole method in 2025 as
[analytic regression from high-precision numerical sampling](https://arxiv.org/abs/2507.17815).

<figure class="diagram">
<svg viewBox="0 0 800 340" role="img" aria-label="Two directions converge on one exact answer. Top-down, constraints narrow the candidate functions from about twenty thousand to five hundred to a few. Bottom-up, high-precision numerics at a few points feed an integer-relation search that fixes the remaining rational coefficients. The result must then reproduce thirty or more digits at points no fit ever saw.">
  <text class="d-cap" x="0" y="14">TOP-DOWN · IMPOSE WHAT MUST BE TRUE</text>
  <rect class="d-box" x="0" y="30" width="190" height="56"/>
  <text class="d-key" x="16" y="56">SINGULARITIES</text>
  <text class="d-cap" x="16" y="74">~20,000 CANDIDATES</text>
  <path class="d-rule d-flow" d="M190 58 L218 58"/>
  <path class="d-fill-rule" d="M224 58 l-11 5 l0 -10 z"/>
  <rect class="d-box" x="230" y="30" width="170" height="56"/>
  <text class="d-key" x="246" y="56">SYMMETRY</text>
  <text class="d-cap" x="246" y="74">~500 LEFT</text>
  <path class="d-rule d-flow d-d1" d="M400 58 L428 58"/>
  <path class="d-fill-rule" d="M434 58 l-11 5 l0 -10 z"/>
  <rect class="d-box" x="440" y="30" width="150" height="56"/>
  <text class="d-key" x="456" y="56">MORE RULES</text>
  <text class="d-cap" x="456" y="74">A FEW LEFT</text>
  <path class="d-accent-line d-flow d-d2" d="M590 58 L700 58 L700 110"/>
  <path class="d-accent-fill" d="M700 120 l-5 -11 l10 0 z"/>
  <rect class="d-accent-box" x="610" y="120" width="190" height="80"/>
  <text class="d-key" x="626" y="150">EXACT FORM</text>
  <text class="d-accent-cap" x="626" y="170">EVERY CONSTANT</text>
  <text class="d-accent-cap" x="626" y="186">PINNED</text>
  <text class="d-cap" x="0" y="222">BOTTOM-UP · COMPUTE WHAT IS TRUE HERE</text>
  <rect class="d-box" x="0" y="236" width="250" height="56"/>
  <text class="d-key" x="16" y="262">HIGH PRECISION</text>
  <text class="d-cap" x="16" y="280">FEW POINTS · 100s OF DIGITS</text>
  <path class="d-rule d-flow" d="M250 264 L278 264"/>
  <path class="d-fill-rule" d="M284 264 l-11 5 l0 -10 z"/>
  <rect class="d-box" x="290" y="236" width="250" height="56"/>
  <text class="d-key" x="306" y="262">INTEGER RELATION</text>
  <text class="d-cap" x="306" y="280">PSLQ · LLL FIX THE RATIONALS</text>
  <path class="d-accent-line d-flow d-d3" d="M540 264 L700 264 L700 210"/>
  <path class="d-accent-fill" d="M700 200 l-5 11 l10 0 z"/>
  <path class="d-rule" d="M0 310 L800 310"/>
  <text class="d-cap" x="0" y="332">THEN THE ANSWER MUST REPRODUCE 30+ DIGITS AT POINTS NO FIT EVER SAW</text>
</svg>
</figure>

*Bootstrap* plus *loops* is where the name comes from, and the reasons this was ideal agent
territory generalize into a checklist: it draws on mathematics, physics and computer science no one
person has mastered; it needs a great deal of code; the field's best ideas are scattered across
Wolfram Language, C++, Python, Julia and papers that never shipped code; and anyone can verify a
final answer by running two scripts. Claude Fable 5 reproduced one of Schwartz's own papers in about
twenty minutes, against the weeks his own code had taken, and after a few weeks thirty integrals
were done end to end — fifteen known results recomputed as a test, fifteen never computed before.

The same machinery escaped physics because one class of amplitude integral — polynomials raised to
powers — has exactly the shape of a **Bayesian evidence** integral with count data:

$$Z = \int_0^1 \!\!\cdots\! \int_0^1 \prod_k P_k(x)^{u_k} \prod_e x_e^{\alpha_e - 1} \, dx$$

where the \(P_k\) are polynomials set by the model and the powers \(u_k\) are set by the observed
counts. The evidence \(Z\) is the probability of the data under a model, averaged over every free parameter — the
number Bayesian statistics compares models with. Most fields estimate it by **Monte Carlo**
sampling, which always carries statistical noise. For this class it can be computed exactly. In
**phylogenetics**, the BootLoops work reports that for four or five species under the simplest
models of DNA change, the evidence for a family tree is an exact fraction; on one mitochondrial gene
of five apes, the accepted tree tied *exactly* with the same tree with human and gorilla exchanged.
A sampler can say two numbers are close. Only exact arithmetic can say they are equal.

For amplitudes, the packages chain into a production line:

<figure class="diagram">
<svg viewBox="0 0 800 300" role="img" aria-label="An eight-stage pipeline in two rows. Top row, left to right: reduce with Kira and Blade to a few masters; find singularities with Landau Alphabet; triage geometry with GeoTriage and Dipstick; count unknowns with Ansatzer. Bottom row, right to left: compute numerics with AMFlow and Wayfinder to hundreds of digits; fit exact rationals with PSLQ and Lockpick; gate on held-out points with Gatekeeper; and finally certify at thirty or more digits with a standalone evaluator.">
  <text class="d-cap" x="0" y="14">ONE INTEGRAL, END TO END · THE AMPLITUDES LINE</text>
  <rect class="d-box" x="0" y="30" width="182" height="70"/>
  <text class="d-key" x="16" y="56">REDUCE</text>
  <text class="d-cap" x="16" y="78">KIRA · BLADE</text>
  <text class="d-cap" x="16" y="94">→ A FEW MASTERS</text>
  <path class="d-rule d-flow" d="M182 65 L200 65"/>
  <path class="d-fill-rule" d="M206 65 l-11 5 l0 -10 z"/>
  <rect class="d-box" x="206" y="30" width="182" height="70"/>
  <text class="d-key" x="222" y="56">SINGULARITIES</text>
  <text class="d-cap" x="222" y="78">LANDAU ALPHABET</text>
  <text class="d-cap" x="222" y="94">→ THE ALPHABET</text>
  <path class="d-rule d-flow d-d1" d="M388 65 L406 65"/>
  <path class="d-fill-rule" d="M412 65 l-11 5 l0 -10 z"/>
  <rect class="d-box" x="412" y="30" width="182" height="70"/>
  <text class="d-key" x="428" y="56">GEOMETRY</text>
  <text class="d-cap" x="428" y="78">GEOTRIAGE · DIPSTICK</text>
  <text class="d-cap" x="428" y="94">→ WHICH FUNCTIONS</text>
  <path class="d-rule d-flow d-d2" d="M594 65 L612 65"/>
  <path class="d-fill-rule" d="M618 65 l-11 5 l0 -10 z"/>
  <rect class="d-box" x="618" y="30" width="182" height="70"/>
  <text class="d-key" x="634" y="56">ANSATZ</text>
  <text class="d-cap" x="634" y="78">ANSATZER</text>
  <text class="d-cap" x="634" y="94">→ HOW MANY UNKNOWNS</text>
  <path class="d-rule d-flow d-d3" d="M709 100 L709 140"/>
  <path class="d-fill-rule" d="M709 150 l-5 -11 l10 0 z"/>
  <rect class="d-box" x="618" y="150" width="182" height="70"/>
  <text class="d-key" x="634" y="176">NUMERICS</text>
  <text class="d-cap" x="634" y="198">AMFLOW · WAYFINDER</text>
  <text class="d-cap" x="634" y="214">→ 100s OF DIGITS</text>
  <path class="d-rule d-flow d-d4" d="M618 185 L600 185"/>
  <path class="d-fill-rule" d="M594 185 l11 -5 l0 10 z"/>
  <rect class="d-box" x="412" y="150" width="182" height="70"/>
  <text class="d-key" x="428" y="176">FIT</text>
  <text class="d-cap" x="428" y="198">PSLQ · LOCKPICK</text>
  <text class="d-cap" x="428" y="214">→ EXACT RATIONALS</text>
  <path class="d-rule d-flow d-d5" d="M412 185 L394 185"/>
  <path class="d-fill-rule" d="M388 185 l11 -5 l0 10 z"/>
  <rect class="d-box" x="206" y="150" width="182" height="70"/>
  <text class="d-key" x="222" y="176">GATE</text>
  <text class="d-cap" x="222" y="198">GATEKEEPER</text>
  <text class="d-cap" x="222" y="214">→ HELD-OUT POINTS</text>
  <path class="d-accent-line d-flow d-d6" d="M206 185 L188 185"/>
  <path class="d-accent-fill" d="M182 185 l11 -5 l0 10 z"/>
  <rect class="d-accent-box" x="0" y="150" width="182" height="70"/>
  <text class="d-key" x="16" y="176">CERTIFIED</text>
  <text class="d-accent-cap" x="16" y="198">≥ 30 DIGITS</text>
  <text class="d-accent-cap" x="16" y="214">+ AN EVALUATOR</text>
  <path class="d-rule" d="M0 246 L800 246"/>
  <text class="d-cap" x="0" y="268">THIRTY FRONTIER INTEGRALS RAN THIS LINE: FIFTEEN KNOWN ONES AS A TEST, FIFTEEN NEW.</text>
  <text class="d-cap" x="0" y="286">THE CHEAP PROBES — DIPSTICK, ANSATZER — RUN FIRST, SO NOTHING EXPENSIVE STARTS BLIND.</text>
</svg>
</figure>

Three engineering choices in that line are worth stealing regardless of domain. **Sizing comes
before computing**: Dipstick runs "cheap probes to run before an expensive calculation", Seedling
predicts a reduction's memory, Ansatzer counts how many values a fit will need — because an agent
left alone will happily launch a three-day job without asking how big it is. **Independent routes
share no code**: pySecDec is used unmodified "as a numerical check sharing no code with other
methods", and Trust checks a reduction "by three routes that share no core code" — N-version
programming applied to arithmetic. **Fits are held out**: Gatekeeper "accepts a fitted formula only
if every left-out value is reproduced", which every machine-learning engineer knows as a validation
set. And one small package deserves copying outright: **Emitall** "recomputes every number quoted in
a report from its result files", with a linter that flags hand-typed digits.

### 7. How "done" is defined

Every agent harness has to answer *how does the agent know when to stop?* BootLoops' answer is the
**BootLoops Standard**: an integral is solved when its full functional form is known *and* a Python
script can evaluate it to arbitrary precision on a laptop — a clause that "forces the code not to
have hidden grids or finite precision precomputed boundary constants." A model that has quietly
tabulated an answer to sixty digits cannot produce the sixty-first. The full version adds that every
constant must be pinned, and that the answer must "reproduce independent numerics to at least
thirty digits, at points never used in any fit, two-precision stable."

Read as a software engineer, that is an executable definition of done, and every clause closes a
specific shortcut:

| Clause | The shortcut it closes |
| --- | --- |
| **A standalone evaluator** | "The answer is in my context" — knowledge that lives only in the model or a private file |
| **Arbitrary precision** | A lookup table passed off as a function |
| **Points never used in any fit** | Reproducing the data you fitted to and calling it agreement |
| **Two-precision stable** | Digits that are rounding noise and move when the precision does |
| **At least thirty digits** | Agreement by coincidence |
| **Predictions sealed with a SHA hash** | Moving the target after seeing the result |

The last row, from the principles page, is the most agent-specific idea in the program:
"Predictions are sealed beforehand with a SHA code to avoid reward hacking." Publish the hash of the
prediction before the run, and you can prove afterwards it was never edited to match. The stated
reason for the whole bar is the right one: "an LLM ran this pipeline, so every claim … had to be
checkable by machine, start to finish." When you cannot trust the worker, you raise the bar on the
work.

### 8. How it refuses to be wrong

Floating-point rounding error is hard to estimate and propagates unchecked. **Ball arithmetic**
stores every number as a ball \([m \pm r]\) — a midpoint \(m\) and a radius \(r\) *guaranteed* to
contain the true value — and every operation updates both. BootLoops runs it on Fredrik Johansson's
[Arb](https://arxiv.org/abs/1611.02831) library, through a package called **Baller**, and the site's
demonstration is a classic stress test, Muller's recurrence:

$$x_{n+1} \;=\; 111 \;-\; \frac{1130}{x_n} \;+\; \frac{3000}{x_n\,x_{n-1}}$$

starting from \(x_0 = 2\) and \(x_1 = -4\). The true sequence converges to 6. In double precision it converges, confidently and without
warning, to 100. The reason is a few lines of algebra. Substituting \(x_n = y_{n+1}/y_n\) makes
the recurrence linear, with characteristic polynomial

$$\begin{gathered} t^3 - 111\,t^2 + 1130\,t - 3000 \\ =\; (t-5)\,(t-6)\,(t-100), \end{gathered}$$

so every solution has the form

$$x_n \;=\; \frac{\alpha\,5^{n+1} + \beta\,6^{n+1} + \gamma\,100^{n+1}}{\alpha\,5^{n} + \beta\,6^{n} + \gamma\,100^{n}}.$$

The exact starting values give \(\gamma = 0\), and the sequence heads for 6. Any rounding error at
all makes \(\gamma\) tiny but not zero — and since the 100 branch outgrows the 6 branch by a
factor of \(100/6 \approx 17\) every step, it takes over long before \(n = 100\).

<figure class="diagram">
<svg viewBox="0 0 800 330" role="img" aria-label="Five ways of computing x(100) of Muller's recurrence. Double precision and fixed 50-digit precision both return 100, confidently and wrongly. Fixed 300-digit precision returns the right value but nothing says so. Ball arithmetic at 50 digits returns uncertified because the radius blew up, and says so. Ball arithmetic with the adaptive solver returns 6.0000000160995649, certified at 240 digits.">
  <text class="d-cap" x="0" y="14">MULLER'S RECURRENCE · WHAT x(100) COMES OUT AS</text>
  <text class="d-cap" x="0" y="44">ARITHMETIC</text>
  <text class="d-cap" x="250" y="44">RESULT</text>
  <text class="d-cap" x="530" y="44">WHAT IT TELLS YOU</text>
  <path class="d-rule" d="M0 54 L800 54"/>
  <text class="d-key" x="0" y="82">DOUBLE · 16 DIGITS</text>
  <text class="d-key" x="250" y="82">100</text>
  <text class="d-cap" x="530" y="81">CONFIDENT, WRONG, NO WARNING</text>
  <text class="d-key" x="0" y="126">FIXED · 50 DIGITS</text>
  <text class="d-key" x="250" y="126">100</text>
  <text class="d-cap" x="530" y="125">MORE DIGITS, SAME WRONG ANSWER</text>
  <text class="d-key" x="0" y="170">FIXED · 300 DIGITS</text>
  <text class="d-key" x="250" y="170">6.0000000160…</text>
  <text class="d-cap" x="530" y="169">RIGHT — AND NOTHING SAYS SO</text>
  <text class="d-key" x="0" y="214">BALL · 50 DIGITS</text>
  <text class="d-key" x="250" y="214">UNCERTIFIED</text>
  <circle class="d-ghost" cx="470" cy="209" r="16"/>
  <text class="d-accent-cap" x="530" y="213">THE RADIUS BLEW UP, AND IT SAYS SO</text>
  <text class="d-key" x="0" y="258">BALL · solve()</text>
  <text class="d-key" x="250" y="258">6.0000000160995649</text>
  <circle class="d-accent-fill" cx="470" cy="253" r="3"/>
  <text class="d-accent-cap" x="530" y="257">CERTIFIED, AT 240 DIGITS</text>
  <path class="d-rule" d="M0 280 L800 280"/>
  <text class="d-cap" x="0" y="302">EVERY ROUNDING ERROR FEEDS A RIVAL SOLUTION THAT GROWS ~17× PER STEP AND HEADS FOR 100.</text>
  <text class="d-cap" x="0" y="320">MORE DIGITS IS A KNOB. THE RADIUS IS THE GAUGE.</text>
</svg>
</figure>

The third row is the important one: at 300 digits the answer is right and the code has no idea.
"Just compute with more digits" is, in the site's phrase, "a knob without a gauge." Baller's quick
start shows the difference. This is adapted from the
[Baller page](https://bootloops.ai/tools/baller.html); the results in the comments are the ones it
documents:

```python
import baller

# Checksum every bundled engine first; refuse to compute on any mismatch.
baller.verify()

step = lambda xp, x: 111 - 1130/x + 3000/(x*xp)

# Fixed precision: 50-digit balls.
r = baller.run(step, x0=(2, -4), n=100, dps=50)
baller.render(r.values[30])     # -> '6.0056'  (only certified digits)
baller.render(r.values[100])    # -> 'UNCERTIFIED[~mid +/- rad]'

# Adaptive: tries 30, 60, 120, then 240 digits until 16 are certified.
res = baller.solve(step, 16, x0=(2, -4), n=100)
baller.render(res, digits=17)   # -> '6.0000000160995649'

# Capped too low to certify anything: it refuses rather than guesses.
baller.solve(step, 16, x0=(2, -4), n=100, max_dps=60)
# -> raises SolveRefused, with achieved_digits == 0
```

Two API decisions there belong in any numerical library: `render` never prints an uncertified value
as a bare number, and `solve` refuses — with the digits it *did* achieve — rather than returning
something unqualified. The site states the limit in four words: **balls falsify; exactness
affirms.** A ball can prove two numbers differ, never that they are equal; equalities come from
exact fractions or a PSLQ identity proven symbolically — the same logic as the phylogenetics tie.

Baller also ships the most useful tool in the repository for anyone writing numerical Python.
`mpmath` numbers keep the precision they were created with, and Python evaluates module-level
assignments and default arguments at import time — usually before the precision is raised. The example from the Baller page:

```python
# evaluator.py
import mpmath as mp
T = mp.mpf(-1)/3            # built at import, at 15 digits
def f(x=mp.mpf('0.02')):    # so is this default argument
    mp.mp.dps = 100
    return x + T            # 100-digit maths on 15-digit inputs
```

The answer is wrong from about the seventeenth digit, with no warning. `dps_lint` finds both lines
without running the file:

```bash
python3 tools/baller/baller/dps_lint.py evaluator.py
```

```output
evaluator.py:3: [module-level] mp.mpf  ::  T = mp.mpf(-1)/3
evaluator.py:4: [default-arg in f()] mp.mpf  ::  def f(x=mp.mpf('0.02')):
```

It exits with status 1, so it can gate a commit. No reviewer catches this bug, no test notices
unless it checks the twentieth digit, and an agent writing numerical code at speed will produce it
constantly.

### 9. How the agents are kept honest

Half of BootLoops is not software. The [`skills`](https://github.com/BootLoops-ai/skills)
repository holds twelve protocols in the open [Agent Skills](https://agentskills.io/) format — plain
markdown any agent framework can load. "The code supplies capability, these supply the discipline
that makes its output trustworthy."

| Skill | The rule it enforces |
| --- | --- |
| **acceptance-gate** | Done means matching an independent route at points no fit saw — with a *positive control* proving the check can fail |
| **constant-recognition** | Declare the constants and integer bounds *before* searching; when nothing closes, refuse rather than invent |
| **planted-truth** | Recover a planted answer before touching real data; catch deliberately corrupted inputs |
| **independence-bookkeeping** | Provenance for every reference; no oracle that fed a fit may certify it |
| **timing-discipline** | Measure a small run first; a projection past a couple of hours means a smarter route |
| **reading-contract** | Assert only what the record supports, citation attached |
| **tool-stewardship** | Check the toolkit before writing code; patch rather than fork; document for the next agent |
| **prove-protocol** | An adversary hunts counterexamples first; independent provers take forced-distinct routes |
| **referee-sim** | Simulate the strongest objection from every audience before anything circulates |
| **lit-review** | Read every candidate paper in full text, not from memory, with reads logged |
| **ref-check** | Verify bibliographies field by field against authoritative databases |
| **prose-lint** | Hunt hype, filler and unsupported claims before publishing |

Nearly every one is a practice software and statistics already had — a positive control is a
mutation test, planted truth is a canary, independence bookkeeping is train/test separation. What is
new is that they are written as instructions to the worker, because the worker cannot be trusted to
remember them. One rule is enforced by the files themselves: the verification code is pinned by SHA
hash and fails closed if edited, and each such file opens with a do-not-edit notice "aimed at the
reader most likely to patch it: your agent." The harness's threat model includes its own operator
editing the test to make it pass.

Set beside Schwartz's failure modes from section 2, the protocols line up almost one for one:

| Failure | What it looked like | What the harness does |
| --- | --- | --- |
| **Declaring victory** | A proof complete but for "one unproven lemma" that was the whole proof | acceptance-gate: a rigid, written definition of done |
| **Satisfiction** | A confident, pleasing answer instead of a correct one — the site's word for sycophancy | Adversarial agents; "iterate until no corrections remain" rather than asking for a list |
| **The grind** | Multi-day brute force instead of a tool that takes minutes | timing-discipline; Dipstick and Ansatzer size the job first |
| **Compaction** | Long sessions lose the plan | Periodic consolidation into files on disk |
| **Answering from memory** | Citing papers it never opened | reading-contract, lit-review: download, read, log |
| **Reward hacking** | Making the check pass without doing the work | Sealed predictions, held-out points, checkers that fail closed |
| **"Good agreement"** | Qualitative claims standing in for numbers | Look at every plot yourself; Emitall ties numbers to files |

Two have no software fix: the sense of time never improved, and taste stays human. The orchestration
around all this is deliberately boring:

<figure class="diagram">
<svg viewBox="0 0 800 320" role="img" aria-label="A master Claude Code session that allocates compute and validates results sits above several project sessions — amplitudes, ecology, genetics and more — each with its own folder and background agents running the computations. To the side, separate sessions for writing, repositories and the website, tool code, and an adversarial referee. State lives in markdown files on disk.">
  <text class="d-cap" x="0" y="14">ONE PERSON, MANY SESSIONS · CLAUDE CODE ON CLOUD VMs</text>
  <rect class="d-accent-box" x="190" y="30" width="240" height="56"/>
  <text class="d-key" x="206" y="56">MASTER SESSION</text>
  <text class="d-accent-cap" x="206" y="74">ALLOCATES COMPUTE · VALIDATES</text>
  <path class="d-rule" d="M310 86 L310 110"/>
  <path class="d-rule" d="M70 110 L550 110"/>
  <path class="d-rule" d="M70 110 L70 130"/>
  <path class="d-rule" d="M240 110 L240 130"/>
  <path class="d-rule" d="M410 110 L410 130"/>
  <path class="d-rule" d="M550 110 L550 130"/>
  <rect class="d-box" x="0" y="130" width="140" height="56"/>
  <text class="d-key" x="16" y="156">AMPLITUDES</text>
  <text class="d-cap" x="16" y="174">SESSION + FOLDER</text>
  <rect class="d-box" x="170" y="130" width="140" height="56"/>
  <text class="d-key" x="186" y="156">ECOLOGY</text>
  <text class="d-cap" x="186" y="174">SESSION + FOLDER</text>
  <rect class="d-box" x="340" y="130" width="140" height="56"/>
  <text class="d-key" x="356" y="156">GENETICS</text>
  <text class="d-cap" x="356" y="174">SESSION + FOLDER</text>
  <rect class="d-ghost" x="490" y="130" width="140" height="56"/>
  <text class="d-key" x="506" y="156">· · ·</text>
  <text class="d-cap" x="506" y="174">36 MANUSCRIPTS</text>
  <path class="d-rule d-flow" d="M34 186 L34 206"/>
  <path class="d-rule d-flow d-d1" d="M106 186 L106 206"/>
  <path class="d-rule d-flow d-d2" d="M204 186 L204 206"/>
  <path class="d-rule d-flow d-d3" d="M276 186 L276 206"/>
  <path class="d-rule d-flow d-d4" d="M374 186 L374 206"/>
  <path class="d-rule d-flow d-d5" d="M446 186 L446 206"/>
  <rect class="d-ghost" x="4" y="206" width="60" height="28"/>
  <text class="d-cap" x="12" y="224">AGENT</text>
  <rect class="d-ghost" x="76" y="206" width="60" height="28"/>
  <text class="d-cap" x="84" y="224">AGENT</text>
  <rect class="d-ghost" x="174" y="206" width="60" height="28"/>
  <text class="d-cap" x="182" y="224">AGENT</text>
  <rect class="d-ghost" x="246" y="206" width="60" height="28"/>
  <text class="d-cap" x="254" y="224">AGENT</text>
  <rect class="d-ghost" x="344" y="206" width="60" height="28"/>
  <text class="d-cap" x="352" y="224">AGENT</text>
  <rect class="d-ghost" x="416" y="206" width="60" height="28"/>
  <text class="d-cap" x="424" y="224">AGENT</text>
  <rect class="d-box" x="650" y="30" width="150" height="44"/>
  <text class="d-key" x="666" y="58">WRITING</text>
  <rect class="d-box" x="650" y="82" width="150" height="44"/>
  <text class="d-key" x="666" y="110">REPOS · SITE</text>
  <rect class="d-box" x="650" y="134" width="150" height="44"/>
  <text class="d-key" x="666" y="162">TOOL CODE</text>
  <rect class="d-accent-box" x="650" y="186" width="150" height="44"/>
  <text class="d-key" x="666" y="214">REFEREE</text>
  <text class="d-cap" x="650" y="252">SIDE SESSIONS</text>
  <path class="d-rule" d="M0 270 L800 270"/>
  <text class="d-cap" x="0" y="292">BACKGROUND AGENTS DO THE RUNS · A CLASSIFIER BLOCK KILLS ONE AGENT, NOT THE SESSION</text>
  <text class="d-cap" x="0" y="310">STATE LIVES IN MARKDOWN FILES, SO A COMPACTED CONTEXT CAN BE REBUILT FROM DISK</text>
</svg>
</figure>

Claude Code sessions run on Google Cloud VMs, one per project, plus a master session that
coordinates, allocates compute and validates; background agents run the computations and write
intermediate results to markdown. The subagents are a **blast-radius** decision — Schwartz regularly
hit Fable 5's [safety classifiers](https://www.anthropic.com/news/improving-fable-5-s-biology-safeguards),
and split this way a block "just shut[s] down a single agent" instead of the session. State on disk
is a **durability** decision: compaction will drop context, so the plan lives in files.

### 10. How to run it yourself

Everything here is from the project's README and INSTALL guide. The tested platforms are Linux on
x86-64 and arm64 — Ubuntu 24.04, and Debian 12 containers with Python 3.12 and Julia 1.11. macOS is
outside the release testing and Windows is not mentioned, so elsewhere a container is the sensible
route. It is also the safe one: many of the tools evaluate their input files, and the README's
advice is to treat inputs from others as code.

```bash
git clone https://github.com/BootLoops-ai/bootloops
cd bootloops
python3 -m venv .venv && source .venv/bin/activate

# the core dependencies
pip install mpmath sympy numpy python-flint pytest

# every package's own battery — a few minutes on a laptop
python3 run_selftests.py --par 8

# a first real computation: the one-loop box, about a minute and a half
python3 tools/landau-alphabet/test_landau_alphabet.py
```

The self-test runner executes exactly the battery each package pins in `tools/BATTERIES.json`. A
battery whose external engine (Kira, FORM, AMFlow …) is absent skips and names what to install,
and the data-gated ones refuse by design. The README expects most packages to come back green and
three to stop with a named error, because they need data the repository does not ship.

The protocols live in the separate `skills` repository and arrive inert until you choose them. In
Claude Code:

```text
/plugin marketplace add BootLoops-ai/skills
/plugin install bootloops-protocols@bootloops
/plugin install bootloops-research@bootloops
```

Codex reads the same marketplace (`codex plugin marketplace add BootLoops-ai/skills`), and any agent
that reads Agent Skills can take them with `npx skills add BootLoops-ai/skills`.

Then the first prompt the README recommends — itself a small lesson: read the index, say which
instruments apply *or that none do*, and wait for approval before anything runs:

> Read `tools/README.md` and the tool guides it points to, then propose a plan for this problem
> for me to approve.

## So what

### What to take from it

- **Before asking whether an agent can do a task, ask whether you can tell if it did.** Where the
  check is cheap and decisive, agents are already transformative; where there is none, the most
  capable model is a liability with a confident tone.
- **A model's judgment of importance needs a human; its claim of correctness needs a machine.**
  Every out-of-field result here needed an expert to make it interesting, and a check to make it
  believable.
- **Build the harness around the domain, not the model.** Tools documented with when to use them and
  what test the answer must pass outlive every model that drives them.
- **Define done as an executable standard.** Standalone evaluator, arbitrary precision, thirty
  digits at unseen points, two-precision stable, predictions sealed by hash — each clause closes a
  shortcut.
- **More digits is a knob; a certified radius is the gauge.** And check your numerical Python for
  `mpmath` values frozen at import.
- **Independent routes share no code, fits are held out, and checkers fail closed** — even against
  your own agent.
- **Every protocol is a scar.** Declared victory, satisfiction, the grind, compaction and reward
  hacking each map to a mechanism. Time estimates and taste stay human.

### What not to take from it

Schwartz is clear about the limits. The harness does not supply **taste**; it certifies an answer,
not that the question was worth asking. It does not replace **data** — "most scientific progress
comes from real-world data that has to be acquired, understood, and checked." It fills in rather than
extends: his image is the convex hull of jagged human knowledge, with the best territory "where
humans could reach but no particular human has." And it only works where a machine can **check** the
answer.

The usual discipline on this blog — separate what is claimed from what someone else has checked:

- **The scientific results are self-reported**, in manuscripts the site says were mostly LLM-drafted,
  some preliminary, several in preparation; the site itself says they "are not written well."
- **The amplitude results are the strongest kind of self-report**, because they ship standalone
  evaluators anyone can rerun. That is the standard doing its job.
- **Numbers drift between tellings.** The Anthropic post gives the ACCSTACK word-stress catalogue as
  6,072 languages; the manuscript abstract says 5,561. Quote the manuscript.
- **The interests are disclosed**: a visiting researcher at Anthropic, Anthropic funding and
  copyright, the write-up on Anthropic's site — and not an Anthropic product.
- **The repository says not to use it for decisions**: "nothing here is intended or fit for clinical,
  actuarial, payment, regulatory or public-safety decisions." An audit that finds Medicare's bins miss
  their own criterion is a claim for the agency to check, not a decision tool.
- **Input files are code.** Many tools evaluate their inputs; the integrity checks "guard against
  accidents. They are not a security boundary." Run it in a container.
- **I have not run it.** The code and output shown here are the project's documented examples, and
  the install steps are from its README. None of it says whether a forest model or a gene
  conversion rate is right.

## Sources

- Matthew Schwartz, **Claude-shaped science**, Anthropic, 1 October 2026 — narrative, failure
  modes, orchestration, project counts and disclosure:
  [anthropic.com/research/claude-shaped-science](https://www.anthropic.com/research/claude-shaped-science).
- **BootLoops** — overview, principles, methods and applications: [bootloops.ai](https://bootloops.ai/)
  and [bootloops.ai/bootloops.html](https://bootloops.ai/bootloops.html).
- **The Harness** — toolkit, protocol layer, the BootLoops Standard, install routes:
  [bootloops.ai/harness.html](https://bootloops.ai/harness.html).
- **The BootLoops toolkit** — the per-package index:
  [bootloops.ai/tools/index.html](https://bootloops.ai/tools/index.html).
- **Baller** — ball arithmetic, Muller's recurrence, the quick start and `dps_lint`:
  [bootloops.ai/tools/baller.html](https://bootloops.ai/tools/baller.html).
- **The manuscripts** — papers, collaborators, status labels, and the ACCSTACK, economics and
  Medicare figures: [bootloops.ai/papers.html](https://bootloops.ai/papers.html).
- **BootLoops-ai/bootloops** at commit `66b680ce` (the release the Anthropic post pins) — README,
  INSTALL.md, `run_selftests.py` and `tools/BATTERIES.json`, the source of section 10:
  [github.com/BootLoops-ai/bootloops](https://github.com/BootLoops-ai/bootloops).
- **BootLoops-ai/skills** README — the twelve skills and their installation:
  [github.com/BootLoops-ai/skills](https://github.com/BootLoops-ai/skills).
- Matthew Schwartz, **Vibe physics: The AI grad student**, Anthropic:
  [anthropic.com/research/vibe-physics](https://www.anthropic.com/research/vibe-physics).
- Barrera, Dersy, Husain, Schwartz and Zhang, **Analytic Regression of Feynman Integrals from
  High-Precision Numerical Sampling**, 2025: [arXiv:2507.17815](https://arxiv.org/abs/2507.17815).
- Fredrik Johansson, **Arb: Efficient Arbitrary-Precision Midpoint-Radius Interval Arithmetic**:
  [arXiv:1611.02831](https://arxiv.org/abs/1611.02831).
- Ferguson, Bailey and Arno, **Analysis of PSLQ, an Integer Relation Finding Algorithm**,
  *Mathematics of Computation* 68(225), 1999, pp. 351–369.
- Hubbell, **The Unified Neutral Theory of Biodiversity and Biogeography**, 2001, and Etienne's 2005
  formula, [doi:10.1111/j.1461-0248.2004.00717.x](https://doi.org/10.1111/j.1461-0248.2004.00717.x),
  as cited in the Anthropic post.
- Andrews, Schwartz and Shapiro, **An LLM Workflow That Reproduces, Improves, and Extends Published
  Economics Research**, NBER w35782: [nber.org/papers/w35782](https://www.nber.org/papers/w35782).
- Datasets: [gnomAD](https://gnomad.broadinstitute.org/),
  [1000 Genomes](https://www.internationalgenome.org/about/), [ACCSTACK](https://accstack.org/).
  Format: [Agent Skills](https://agentskills.io/).

The algebra behind Muller's recurrence is my own working; every other
figure is from the sources above, and every scientific result is the BootLoops author's unless a
collaborator is named.
