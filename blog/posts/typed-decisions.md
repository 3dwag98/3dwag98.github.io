---
title: A model that answers in types — TypeSafe's Jev, from the basics up
date: 2026-09-16
tags: [ai-infrastructure, system-design, llm, calibration]
summary: TypeSafe AI shipped a model that does not write. It returns a typed value and a calibrated probability in 70 to 500 milliseconds, at $42 per billion input tokens. What that actually is, where it sits in a system design, and what it does to the infrastructure underneath — including which of the numbers are still the vendor's own.
---

Almost every AI feature running in production today has the same shape. A service assembles a
prompt, asks a language model a question in English, gets English back, and then tries to
recover a decision from the middle of it. There is a retry for when the JSON is malformed, a
schema validator behind that, and — if the team has been burned once — a second model call
whose only job is to grade the first one.

That parsing step is where the bodies are buried. It is also, when you look at it honestly, the
only part of the interaction anyone wanted. The prose was never the product; it was the
transport.

[TypeSafe AI](https://typesafe.ai/), whose first model **Jev** came out of early access this
month, has built a model that deletes the transport. You send it state and a set of typed
questions. It sends back typed answers with a probability attached to each — no tokens, no
prose, nothing to parse. The company calls this class of thing a **System One Model**, and
claims it is 40 to 200 times faster and a couple of orders of magnitude cheaper than a frontier
LLM on the same work.

This is worth understanding from the ground up, because the interesting part is not the
benchmark. It is that a model with this output shape changes what the system around it has to
look like — and most of this post is about that system, not the model.

## The one-paragraph version

Jev takes a blob of unstructured state and a dictionary of questions, evaluates every question
in parallel against that state, and returns a typed value per question plus the full probability
distribution behind it. There are three question shapes — pick one of my options, place this on
my rubric, is this claim true — and nothing else. Because there is no token-by-token decoding,
answers land in 70 to 500 milliseconds and input is priced at $0.042 per million tokens with
output free. Because every answer carries a calibrated confidence, your code can act on the
confident ones and escalate the rest, which is the actual design pattern and the reason to care.
The accuracy is a notch below frontier LLMs on the vendor's own evaluation, the calibration
claim has no published curve behind it yet, and the architecture is undisclosed.

## Part one — the basics

### The borrowed name

*System One* and *System Two* come from Daniel Kahneman's **Thinking, Fast and Slow**. System
one is the fast, automatic judgment — the one that reads a face as angry before you have decided
to look at it. System two is the slow, deliberate one that does long division.

The analogy maps onto software more cleanly than most borrowed psychology. Look at what teams
actually ask LLMs to do in production and the great majority of it is system one work: *is this
ticket a refund request, how severe is this alert, does this invoice line match this purchase
order, should this go to the fraud queue.* These are judgments, not compositions. Nobody wants
four paragraphs about the alert. They want a severity and a route.

Asking a frontier model for that is asking a system two engine to do system one work. It will
do it well, and it will do it by generating an essay's worth of machinery to produce a value
your switch statement was always going to consume as an enum.

<figure class="diagram">
<svg viewBox="0 0 800 300" role="img" aria-label="One piece of state can be answered two ways: a System One path returning a typed value with a probability in milliseconds, or a System Two path generating prose in seconds which then has to be parsed.">
  <text class="d-cap" x="0" y="14">ONE STATE · TWO KINDS OF ANSWER</text>
  <rect class="d-box" x="0" y="96" width="156" height="70"/>
  <text class="d-key" x="16" y="126">STATE</text>
  <text class="d-cap" x="16" y="146">TICKET · ALERT · FRAME</text>
  <path class="d-accent-line d-flow" d="M156 118 L186 118 L186 62 L226 62"/>
  <path class="d-accent-fill" d="M232 62 l-11 5 l0 -10 z"/>
  <rect class="d-accent-box" x="238" y="34" width="276" height="56"/>
  <text class="d-key" x="256" y="60">SYSTEM ONE</text>
  <text class="d-accent-cap" x="256" y="78">TYPED VALUE + PROBABILITY</text>
  <path class="d-accent-line d-flow d-d1" d="M514 62 L556 62"/>
  <path class="d-accent-fill" d="M562 62 l-11 5 l0 -10 z"/>
  <text class="d-accent-cap" x="572" y="58">70–500 ms</text>
  <text class="d-cap" x="572" y="78">YOUR CODE ACTS</text>
  <path class="d-rule d-flow-slow" d="M156 144 L186 144 L186 200 L226 200"/>
  <path class="d-fill-rule" d="M232 200 l-11 5 l0 -10 z"/>
  <rect class="d-box" x="238" y="172" width="276" height="56"/>
  <text class="d-key" x="256" y="198">SYSTEM TWO</text>
  <text class="d-cap" x="256" y="216">TOKEN · BY · TOKEN · PROSE</text>
  <path class="d-rule d-flow-slow d-d2" d="M514 200 L556 200"/>
  <path class="d-fill-rule" d="M562 200 l-11 5 l0 -10 z"/>
  <text class="d-cap" x="572" y="196">SECONDS</text>
  <text class="d-cap" x="572" y="216">THEN YOU PARSE IT</text>
  <path class="d-rule" d="M0 256 L800 256"/>
  <text class="d-cap" x="0" y="278">MOST PRODUCTION AI WORK IS A JUDGMENT, NOT A COMPOSITION —</text>
  <text class="d-cap" x="0" y="294">AND A JUDGMENT DOES NOT NEED A LANGUAGE TO TRAVEL IN.</text>
</svg>
</figure>

### What "typed" actually buys

The word is doing precise work here, and it is not the same promise as the *structured outputs*
or *JSON mode* your current provider already offers.

Constrained decoding — the mechanism behind JSON mode — still generates tokens; it just masks
the ones that would break the grammar at each step. You get syntactically valid JSON. You do not
get a value from your enum unless the grammar was built to enforce that, you do not get a
probability, and you still pay for every token on the way out.

And the constraint is not free in accuracy either, which is the part that rarely gets said out
loud. The evidence is mixed and task-dependent — some evaluations find schema-constrained
decoding costs essentially nothing, while on hard document extraction others have measured a
model's pass rate falling from 86.9% to 70.0% once a schema was imposed, with overall validity
dropping alongside it. The suggested mechanism is unglamorous and plausible: holding the grammar
in a valid state is work done with the same attention that was supposed to be reading the
document. Either way, JSON mode is a tax paid to get a parseable answer out of a model that
wanted to write prose.

Jev's outputs are not generated text that happens to validate. There is no string being emitted
at all. The answer *is* a value drawn from the option set you supplied, which means schema
conformance is not a property the model achieves — it is a property of the output space.

This is the honest version of the company's **"can't hallucinate"** line, and it is worth being
precise about, because the line is doing more marketing than engineering. What is guaranteed is
*structural*: you will never get a category you did not define, a malformed payload, or a
refusal in place of an answer. What is not guaranteed is *correctness*. A model that must pick
one of your three options will pick one of your three options even when the right answer was a
fourth one you did not think of. Constraining the shape of a wrong answer does not make it
right; it makes it parseable.

That is still worth a great deal. It removes an entire class of production incident — the 3am
page for a `JsonParseException` on a response that was fine yesterday. It just is not the same
claim as accuracy, and the two get blurred in every write-up of this launch.

### Three shapes, and only three

The whole API surface is three question types. The constraint is the design.

| Primitive | The question | What comes back |
| --- | --- | --- |
| **Choice** | "Which of these options?" | The chosen option, a probability for every candidate, a confidence |
| **Score** | "Which level on this rubric?" | The level, a probability per level, a confidence |
| **Noul** | "Is this statement true?" | A calibrated probability between 0 and 1 |

`Choice` takes up to 255 options, which is a real ceiling worth knowing before you design a
taxonomy around it. `Score` takes an ordered list of described levels — the description is the
rubric, and writing it well is most of the work. `Noul` — reportedly a portmanteau of *no* and
*null* — is the binary one, and it is the primitive you will reach for most, because almost any
complicated judgment decomposes into a handful of independent yes/no claims.

A request is a state object plus a dictionary of questions. From TypeSafe's own documentation:

```python
from typesafe_sdk import Choice, Noul, Score, TypeSafeClient

state = {
    "ticket_message": "My flight was cancelled. Can I get a refund?",
    "refund_policy": "Cancelled flights are eligible for a full refund.",
}

with TypeSafeClient() as client:
    response = client.system_one(
        state=state,
        questions={
            "refund_requested": Noul(
                instructions="Does `ticket_message` request a refund?",
            ),
            "request_type": Choice(
                instructions="What is the main request in `ticket_message`?",
                criteria={
                    "refund": "The customer wants money returned.",
                    "rebooking": "The customer wants a replacement flight.",
                    "information": "The customer is asking for information only.",
                },
            ),
            "frustration": Score(
                instructions="How frustrated does the customer appear in `ticket_message`?",
                criteria=[
                    "Calm and neutral.",
                    "Concerned but civil.",
                    "Very angry or using strong language.",
                ],
            ),
        },
    )

print(response.answers["refund_requested"].noul)
print(response.answers["request_type"].choice)
print(response.answers["frustration"].score)
```

Three things in that snippet matter more than they look.

**The questions are keyed.** `response.answers["request_type"].choice` is the entire integration.
There is no envelope to unwrap, no "sometimes it wraps the JSON in a code fence", no second
parse. The key you sent is the key you read back.

**Each question is evaluated independently.** Every question in the call sees the same state and
none of them see each other. That is a deliberate isolation property: the answer to question
seven cannot be contaminated by the model having just talked itself into an answer for question
six. It also means there is no chain of thought to go wrong, and no chain of thought to inspect —
a trade I will come back to.

**The instructions reference the state by key.** ``Does `ticket_message` request a refund?``
points at a field. The state is a structured object you assemble, not a paragraph you compose,
and the questions address its parts by name. In practice this is the part that feels most
different from prompting: you are not writing an essay to a model, you are defining a schema and
asking questions about fields in it.

### Calibration, which is the actual claim

The training method is called **RLCD — Reinforcement Learning for Calibrated Decisions**, set
against RLHF (human preference) and RLVR (verifiable reward). The stated optimization target is
neither preference nor raw accuracy. It is calibration.

A calibrated model is one whose confidence means something. Take every answer it gave with 70%
confidence; about 70% of them should be correct. Not 95%, which would mean it is underselling
itself, and not 50%, which is the familiar failure — the model that is fluent, certain and
wrong, and gives you no signal at all that this particular answer is the one that will embarrass
you.

<figure class="diagram">
<svg viewBox="0 0 800 330" role="img" aria-label="A reliability diagram: stated confidence on the horizontal axis against observed accuracy on the vertical. A calibrated model tracks the diagonal; an overconfident model sags below it, being right far less often than it claims.">
  <text class="d-cap" x="0" y="14">RELIABILITY — WHAT A CONFIDENCE NUMBER IS WORTH</text>
  <text class="d-cap" x="40" y="42">OBSERVED ACCURACY</text>
  <path class="d-rule" d="M60 56 L60 268"/>
  <path class="d-rule" d="M60 268 L400 268"/>
  <text class="d-cap" x="40" y="286">0.5</text>
  <text class="d-cap" x="380" y="286">1.0</text>
  <text class="d-cap" x="176" y="304">STATED CONFIDENCE</text>
  <path class="d-accent-line" d="M60 268 L400 60"/>
  <circle class="d-accent-fill" cx="145" cy="216" r="4"/>
  <circle class="d-accent-fill" cx="230" cy="164" r="4"/>
  <circle class="d-accent-fill" cx="315" cy="112" r="4"/>
  <text class="d-accent-cap" x="300" y="48">CALIBRATED</text>
  <path class="d-ghost" d="M60 268 L145 244 L230 226 L315 208 L400 196"/>
  <circle class="d-fill-rule" cx="230" cy="226" r="4"/>
  <circle class="d-fill-rule" cx="315" cy="208" r="4"/>
  <text class="d-cap" x="330" y="228">OVERCONFIDENT</text>
  <path class="d-accent-line" d="M230 172 L230 218"/>
  <path class="d-accent-fill" d="M230 224 l5 -11 l-10 0 z"/>
  <text class="d-accent-cap" x="238" y="196">THE GAP YOU PAY FOR</text>
  <path class="d-rule" d="M460 56 L460 268"/>
  <text class="d-key" x="486" y="80">SAYS 0.8</text>
  <text class="d-cap" x="486" y="100">RIGHT 8 TIMES IN 10 · USABLE</text>
  <text class="d-key" x="486" y="140">SAYS 0.8</text>
  <text class="d-cap" x="486" y="160">RIGHT 6 TIMES IN 10 · A TRAP</text>
  <text class="d-cap" x="486" y="200">THE SECOND MODEL IS NOT LESS</text>
  <text class="d-cap" x="486" y="218">ACCURATE — IT IS LESS HONEST,</text>
  <text class="d-cap" x="486" y="236">AND DISHONESTY IS WHAT BREAKS</text>
  <text class="d-cap" x="486" y="254">A THRESHOLD YOU BUILT ON IT.</text>
  <path class="d-rule" d="M0 306 L800 306"/>
  <text class="d-cap" x="0" y="326">CALIBRATION IS A PROPERTY OF A POPULATION OF ANSWERS — NEVER OF THE ONE IN FRONT OF YOU</text>
</svg>
</figure>

The strongest evidence that this is a real problem, worth a company, comes from a competitor.
OpenAI's own GPT-4 technical report shows the pre-trained model to be well calibrated — its
stated confidence tracking its accuracy closely — and then shows the same model after
post-training with that relationship visibly flattened. Alignment bought helpfulness and charged
calibration for it. This is not buried in an appendix; it is a figure, before and after, side by
side, published by the people who did it.

Read against that, **RLCD is less a new frontier than an undo.** The property being sold here is
one that pre-training already produces and preference optimization destroys, and a training
method aimed at preserving it is a correction rather than an invention. That is not a criticism —
a correction can be exactly what a market needs, and nobody else is selling one. But it reframes
the pitch. The interesting claim is not that a model *can* be calibrated; we knew that. It is
that someone finally optimized for keeping it that way instead of trading it away for
agreeableness.

Confidence, in the response, is a single number derived from the probability distribution: how
concentrated the mass is on one outcome. Spread out means uncertain, concentrated means
confident. The full `probabilities` array is returned as well, so if you would rather compute
entropy, or margin between the top two options, or anything else, you are not locked into their
statistic.

The distinction that matters, and the one the documentation is quiet about: **calibration is a
property of a population of predictions, not of any single one**. "This answer is 0.82 confident"
tells you nothing on its own. It only becomes information across thousands of answers, where
0.82 answers are right about 82% of the time. That is enough to build a routing policy on. It is
not enough to justify any individual automated action as safe, and a design that treats one high
confidence score as a guarantee has misread what was sold.

### What it is not for

The company is unusually clear about the shape of the hole, and it is a big one. Jev does not
generate text, so there is no summarization, no drafting, no code, no conversation, no multi-turn
anything. No images or audio. Long-context reasoning is out — the entire request, state and
questions together, shares a budget of around **32,000 tokens**, roughly 150,000 characters.

So this is not a frontier model competitor. It is a component, and the interesting design
question is what the rest of the system looks like once you have one.

## Part two — the system design

### The decision is not the design. The gate is.

Here is the move that makes this architecture worth adopting, and it has almost nothing to do
with the model's intelligence.

When a model returns prose, your code has exactly one lever: use the answer, or don't. Confidence
is not available, or is available only as a number the model wrote down about itself in the same
breath as the answer — which is self-assessment, not measurement, and is exactly what an
overconfident model is bad at.

The literature on that workaround is bleak. Studies of *verbalized confidence* — asking a model
in words how sure it is — find the numbers close to useless: models cluster near the top of the
scale almost regardless of whether they are right, with reported confidence averaging around 94%
across tasks in one evaluation. They are decisive in tone while being unsure in fact, which is
the worst available combination for a caller trying to decide whether to act. A number computed
from the output distribution is a different kind of object from a number the model wrote down
about itself, and only the first one can be checked against outcomes.

When every answer arrives with a calibrated probability, confidence becomes a **second axis** to
design against. The decision and the certainty of the decision are separate inputs, and policy
lives in your code, in a form a reviewer can read, rather than inside a prompt that asks the
model to please be careful.

That produces a ladder, and readers of [the failure post](post.html?p=designing-for-failure) will
recognize its shape immediately — it is the same discipline applied to a different kind of
unavailable truth. There, the question was what to serve when the system of record is down.
Here, it is what to do when the judgment is uncertain. In both cases the ladder must be written
down in advance, because the code answers the question either way.

<figure class="diagram">
<svg viewBox="0 0 800 320" role="img" aria-label="A confidence ladder with four rungs: act automatically above 0.9, confirm with a user in the middle band, escalate to a slower model or a human below 0.5, and refuse when the answer is needed but nothing can vouch for it. Each rung shows what it costs.">
  <text class="d-cap" x="40" y="20">CONFIDENCE</text>
  <text class="d-cap" x="250" y="20">WHAT THE SYSTEM DOES</text>
  <text class="d-cap" x="560" y="20">WHAT THAT RUNG COSTS</text>
  <path class="d-rule" d="M0 32 L800 32"/>
  <path class="d-accent-line" d="M16 56 L16 272"/>
  <rect class="d-accent-fill" x="10" y="50" width="12" height="12"/>
  <text class="d-key" x="40" y="61">&#8805; 0.90</text>
  <text class="d-cap" x="250" y="61">ACT · NOBODY IS INVOLVED</text>
  <text class="d-cap" x="560" y="61">THE ERRORS YOU CHOSE TO ACCEPT</text>
  <rect class="d-accent-fill" x="10" y="104" width="12" height="12"/>
  <text class="d-key" x="40" y="115">0.70 – 0.90</text>
  <text class="d-cap" x="250" y="115">ACT, BUT ASK FIRST OR MARK IT</text>
  <text class="d-cap" x="560" y="115">A CLICK, AND SOMEONE'S ATTENTION</text>
  <rect class="d-accent-fill" x="10" y="158" width="12" height="12"/>
  <text class="d-key" x="40" y="169">0.50 – 0.70</text>
  <text class="d-cap" x="250" y="169">ESCALATE · SLOWER MODEL, OR A PERSON</text>
  <text class="d-cap" x="560" y="169">SECONDS AND DOLLARS, PER CASE</text>
  <rect class="d-accent-fill" x="10" y="212" width="12" height="12"/>
  <text class="d-key" x="40" y="223">&lt; 0.50</text>
  <text class="d-cap" x="250" y="223">DO NOT ACT · SAY SO, FAST</text>
  <text class="d-cap" x="560" y="223">THE AUTOMATION, FOR THIS CASE</text>
  <rect class="d-accent-fill" x="10" y="260" width="12" height="12"/>
  <text class="d-key" x="40" y="271">ANY</text>
  <text class="d-cap" x="250" y="271">DESTRUCTIVE? RAISE EVERY NUMBER</text>
  <text class="d-cap" x="560" y="271">HEADROOM YOU PAY FOR DAILY</text>
  <path class="d-rule" d="M0 288 L800 288"/>
  <text class="d-cap" x="0" y="310">THRESHOLDS BELONG TO THE ACTION, NOT TO THE MODEL — A REFUND AND A TAG DO NOT SHARE A NUMBER</text>
</svg>
</figure>

In code the gate is unremarkable, which is the point — it is reviewable, testable and diffable
in a way a prompt is not:

```typescript
const { choice, confidence } = answers.request_type;

// Thresholds belong to the action. A tag and a refund do not share a number.
const gate = ACTION_THRESHOLDS[choice];          // e.g. { auto: 0.94, assist: 0.70 }

if (confidence >= gate.auto) {
  return handle(choice, { mode: "auto" });
}
if (confidence >= gate.assist) {
  return handle(choice, { mode: "suggest", needsConfirmation: true });
}
return escalate({ reason: "low_confidence", choice, confidence });
```

TypeSafe's own guidance is a three-tier version of this: above 0.9 act automatically for
high-stakes actions, in the middle band confirm or flag, below 0.5 do not act at all. Their
documentation is candid that the numbers are a starting point — "start with conservative
thresholds, test with your own data, and adjust as you observe results" — which is the right
advice and also an admission that the thresholds are yours to earn, not theirs to give.

The asymmetry is the part teams get wrong. A wrong auto-tag costs a tag. A wrong auto-refund
costs a refund, and then costs an audit. One threshold table for the whole service means the
threshold was chosen by whichever action was easiest to reason about — the same mistake as one
`cacheTtl` for every resource class.

### Decompose, then compose

The second design shift is subtler and probably more valuable: because questions are cheap and
evaluated in parallel, the incentive flips from *ask one big question* to *ask twenty small
ones.*

A single "should this incident page someone?" is a monolith. It hides its reasoning, it cannot
be tested in pieces, and when it starts being wrong you have nowhere to stand. The same judgment
as a fan of atomic questions — is a customer-facing surface affected, is the error rate above
baseline, is there an active deploy, is this a known-flapping check, is a mitigation already
running — gives you five signals you can log, test, threshold and reason about separately, and
the policy that combines them is ordinary code that a person can read on a Tuesday.

TypeSafe names this pattern **speculative fan-out**: send every question you might need,
including ones you will probably discard, and let your code decide afterwards what was relevant.
That advice is only sane because of the parallelism — adding questions barely moves the latency,
and the input state is billed once no matter how many questions ride along with it.

There is an independent finding worth putting next to this. [Anthony Maio's
analysis](https://anthonymaio.substack.com/p/jev-the-language-model-that-wont) notes that when he
ran the comparison, *every* model got more accurate, faster and cheaper once placed inside an
explicit decomposed workflow — not only Jev. That is the most useful sentence written about this
launch so far. **A good part of the gain on offer here is the decomposition, and the
decomposition is available to you today with the model you already have.** Jev makes the pattern
cheap enough to be the default rather than an optimization; it did not invent it.

### What the new failure modes are

Every architecture trades its old failure modes for new ones, and this one is no exception.

| Failure | What it looks like | What catches it |
| --- | --- | --- |
| **Schema-valid and wrong** | A clean answer from your enum, confidently, for a case none of your options fit | An explicit `other` / `unclear` option, and alerting on how often it wins |
| **Missing option** | Reality has a fourth category; the model must pick from three | Sampling real cases by hand, forever |
| **Threshold rot** | Numbers tuned last quarter against a distribution that has moved | Replaying labelled traffic on a schedule, not on an incident |
| **Distribution shift** | Inputs drift, calibration quietly stops holding | Watching the confidence histogram's shape, not just its mean |
| **Rubric drift** | The policy changed; the `criteria` string did not | Treating criteria as versioned config with an owner |
| **No reasoning to inspect** | An answer that is wrong and unaccountable | Decomposition — the small questions *are* the explanation |

The first row is the one to design against from day one. Add the escape hatch option — `other`,
`unclear`, `needs_human` — to every `Choice` where the taxonomy could be incomplete, which is all
of them. Then alert on its rate. A category that starts winning 4% of the time when it used to
win 0.5% is the earliest signal you will get that the world has moved out from under your
taxonomy, and it arrives long before anyone files a bug.

The last row deserves its own sentence, because it is the genuine loss in this trade. A
reasoning model that gets something wrong leaves a trail you can read; a typed decision is an
answer with no story attached. The mitigation is not a feature the vendor can ship. It is the
decomposition itself: five logged atomic judgments explain a routing decision better than a
paragraph of post-hoc rationalization ever did — and unlike that paragraph, they are the actual
inputs, not a narrative written alongside them.

### Where the escalation goes

The ladder needs somewhere to escalate *to*, and this is where the architecture gets genuinely
attractive: Jev does not replace your frontier model, it filters for it.

<figure class="diagram">
<svg viewBox="0 0 800 300" role="img" aria-label="A two-tier decision path: every request hits the fast typed model first; high-confidence answers are acted on immediately, and only the uncertain remainder is escalated to a slower frontier model or a human queue.">
  <text class="d-cap" x="0" y="14">TWO TIERS — THE FAST PATH FILTERS FOR THE SLOW ONE</text>
  <rect class="d-box" x="0" y="34" width="140" height="56"/>
  <text class="d-key" x="16" y="68">TRAFFIC</text>
  <path class="d-accent-line d-flow" d="M140 62 L182 62"/>
  <path class="d-accent-fill" d="M188 62 l-11 5 l0 -10 z"/>
  <rect class="d-accent-box" x="194" y="34" width="200" height="56"/>
  <text class="d-key" x="212" y="60">TYPED DECISION</text>
  <text class="d-accent-cap" x="212" y="78">EVERY REQUEST · SUB-SECOND</text>
  <path class="d-accent-line d-flow d-d1" d="M394 62 L466 62"/>
  <path class="d-accent-fill" d="M472 62 l-11 5 l0 -10 z"/>
  <text class="d-accent-cap" x="400" y="52">CONFIDENT</text>
  <rect class="d-box" x="478" y="34" width="200" height="56"/>
  <text class="d-key" x="496" y="60">ACT</text>
  <text class="d-cap" x="496" y="78">THE LARGE MAJORITY</text>
  <path class="d-rule d-flow-slow" d="M294 90 L294 150"/>
  <path class="d-fill-rule" d="M294 156 l5 -11 l-10 0 z"/>
  <text class="d-cap" x="304" y="126">UNCERTAIN · THE TAIL</text>
  <rect class="d-box" x="194" y="162" width="200" height="56"/>
  <text class="d-key" x="212" y="188">FRONTIER MODEL</text>
  <text class="d-cap" x="212" y="206">SECONDS · CENTS · REASONS</text>
  <path class="d-rule d-flow-slow d-d2" d="M394 190 L466 190"/>
  <path class="d-fill-rule" d="M472 190 l-11 5 l0 -10 z"/>
  <rect class="d-ghost" x="478" y="162" width="200" height="56"/>
  <text class="d-key" x="496" y="188">A PERSON</text>
  <text class="d-cap" x="496" y="206">MINUTES · THE LAST RUNG</text>
  <path class="d-rule" d="M0 246 L800 246"/>
  <text class="d-cap" x="0" y="268">THE EXPENSIVE TIERS STOP SEEING THE EASY 90% — WHICH IS WHERE THE BILL GOES,</text>
  <text class="d-cap" x="0" y="286">AND WHY THE TAIL CAN NOW AFFORD A MODEL THAT THINKS PROPERLY ABOUT IT.</text>
</svg>
</figure>

Run every request through the cheap typed path. Act on the confident majority. Send only the
uncertain tail to the model that costs a thousand times more and takes ten seconds, and the
genuinely hard residue to a person. The economics invert pleasantly: the expensive tier stops
paying for the easy cases, which frees enough budget to let it think properly about the hard
ones.

Two rules keep this honest, and both are borrowed from resilience work because they are the same
rules.

**Every rung must be exercised in normal operation.** An escalation path that runs only during
incidents is a path that has never been tested. Route a small slice of confident traffic down the
slow path deliberately — it is also, conveniently, how you measure whether the fast path was
right.

**The ladder must be able to climb back up.** If the confident band shrinks because the
distribution moved, something has to notice and something has to be able to widen it again once
the model, the rubric or the thresholds are fixed. A system that quietly escalates more and more
of its traffic to humans has not degraded gracefully; it has stopped being automation, one
percentage point at a time, and the graph that shows it is the escalation rate — which is why
that is the number to alert on, not the error rate.

## Part three — the infrastructure

### Why it is fast, and what that costs

An autoregressive model produces one token, appends it to the context, and runs the whole
forward pass again for the next one. A 300-token answer is 300 sequential passes. The latency is
structural — it is the length of the answer times the time per pass, and no amount of hardware
removes the dependency chain, because token *n+1* genuinely cannot start before token *n*
exists.

"No tokens, so it is faster" is where most coverage stops, and it is the symptom rather than the
cause. The cause is **arithmetic intensity**, and it earns a paragraph because it is the part of
this that is genuinely an infrastructure story rather than a modelling one.

A forward pass has to move the model's weights out of memory and into the compute units. During
generation it does that for every single token and gets one token of useful work back each
time — billions of parameters streamed to produce a few bytes. The ratio of arithmetic to memory
traffic is dreadful, so the accelerator spends almost all of its time waiting on memory instead
of computing; decoding at small batch sizes is commonly described as running at under one percent
of the hardware's compute capability. A GPU in that state is not busy. It is an extremely
expensive memory bus.

This is also why speculative decoding works, and the comparison clarifies what is going on.
Drafting tokens with a small model and *verifying* a batch of them in one pass of the large one
beats generating them one at a time — because the verification pass is compute-dense where the
generation passes were not. The trick is not doing less work. It is doing the same work in a
shape the hardware is good at.

Jev's answers are not sequences. Every question's distribution is produced in a single pass, and
questions do not depend on one another, so they resolve together. In arithmetic-intensity terms
that is the same move speculative decoding makes, taken to its conclusion: one compute-dense pass
instead of a chain of memory-bound ones. The 40-to-200× figure is not, on this reading, a claim
about a smarter model. It is what happens when you stop asking the hardware to do the thing it is
worst at.

<figure class="diagram">
<svg viewBox="0 0 800 300" role="img" aria-label="Autoregressive decoding runs one forward pass per token in a chain, while parallel evaluation resolves every question in a single pass at once.">
  <text class="d-cap" x="0" y="14">AUTOREGRESSIVE · ONE PASS PER TOKEN, IN A CHAIN</text>
  <rect class="d-box" x="0" y="30" width="86" height="40"/>
  <text class="d-key" x="26" y="56">T1</text>
  <path class="d-rule d-flow" d="M86 50 L116 50"/>
  <path class="d-fill-rule" d="M122 50 l-11 5 l0 -10 z"/>
  <rect class="d-box" x="128" y="30" width="86" height="40"/>
  <text class="d-key" x="154" y="56">T2</text>
  <path class="d-rule d-flow d-d1" d="M214 50 L244 50"/>
  <path class="d-fill-rule" d="M250 50 l-11 5 l0 -10 z"/>
  <rect class="d-box" x="256" y="30" width="86" height="40"/>
  <text class="d-key" x="282" y="56">T3</text>
  <path class="d-rule d-flow d-d2" d="M342 50 L372 50"/>
  <path class="d-fill-rule" d="M378 50 l-11 5 l0 -10 z"/>
  <text class="d-cap" x="386" y="56">· · ·</text>
  <path class="d-rule d-flow d-d3" d="M424 50 L454 50"/>
  <path class="d-fill-rule" d="M460 50 l-11 5 l0 -10 z"/>
  <rect class="d-box" x="466" y="30" width="86" height="40"/>
  <text class="d-key" x="486" y="56">T300</text>
  <text class="d-cap" x="572" y="56">LATENCY = LENGTH × PASS</text>
  <path class="d-rule" d="M0 100 L800 100"/>
  <text class="d-accent-cap" x="0" y="126">PARALLEL · EVERY QUESTION IN ONE PASS</text>
  <rect class="d-accent-box" x="0" y="142" width="130" height="108"/>
  <text class="d-key" x="18" y="184">STATE</text>
  <text class="d-accent-cap" x="18" y="204">BILLED ONCE</text>
  <path class="d-accent-line d-flow" d="M130 160 L212 160"/>
  <path class="d-accent-fill" d="M218 160 l-11 5 l0 -10 z"/>
  <path class="d-accent-line d-flow" d="M130 196 L212 196"/>
  <path class="d-accent-fill" d="M218 196 l-11 5 l0 -10 z"/>
  <path class="d-accent-line d-flow" d="M130 232 L212 232"/>
  <path class="d-accent-fill" d="M218 232 l-11 5 l0 -10 z"/>
  <rect class="d-box" x="224" y="142" width="240" height="36"/>
  <text class="d-key" x="240" y="166">Q1 · NOUL</text>
  <rect class="d-box" x="224" y="178" width="240" height="36"/>
  <text class="d-key" x="240" y="202">Q2 · CHOICE</text>
  <rect class="d-box" x="224" y="214" width="240" height="36"/>
  <text class="d-key" x="240" y="238">Q3 · SCORE</text>
  <text class="d-accent-cap" x="486" y="180">ISOLATED FROM EACH OTHER</text>
  <text class="d-accent-cap" x="486" y="200">70–500 ms FOR ALL OF THEM</text>
  <path class="d-rule" d="M0 268 L800 268"/>
  <text class="d-cap" x="0" y="290">NO SEQUENCE MEANS NO DEPENDENCY CHAIN — AND NOTHING TO STREAM, EITHER</text>
</svg>
</figure>

The reported numbers: end-to-end 70 to 500 milliseconds against 3 to 329 seconds for frontier
LLMs on the same tasks. The Doom demo the company used at launch — feeding structured game state
in and taking a move out — returned in 0.114 seconds against 8.566 seconds for GPT-5.6 Terra.

For an infrastructure engineer the consequences are more interesting than the multiplier:

**It fits inside a request.** At 100ms you can put a judgment on a synchronous path — inside the
API call, inside the page render — rather than behind a queue, a job and a websocket to tell the
user it finished later. A very large amount of accidental architecture in current AI features
exists solely to hide multi-second latency. That scaffolding can go.

**There is nothing to stream, and nothing to cancel.** Streaming is a coping mechanism for slow
generation; below a couple of hundred milliseconds it stops being necessary. The flip side is
that partial results do not exist. A call either lands inside your budget or it does not, which
makes the timeout policy simpler and slightly less forgiving.

**Isolation is a scaling property, not just a correctness one.** Because questions do not see
each other, their cost does not compound — the documentation makes the point that this avoids
"context rot" as question volume grows, and the practical version is that a 40-question request
behaves like a 4-question one.

**Per-question latency is the wrong unit.** Budget per *call*, and put as many questions in it
as the token ceiling allows. The state is what you pay for; the questions are nearly free
passengers.

### The cost model, and what it changes

| | Jev | A frontier LLM, same work |
| --- | --- | --- |
| Input | $0.042 / MTok — $42 per billion | Dollars per million, commonly 100–400× more |
| Output | Free — "too cheap to meter" | Typically 3–5× the input rate |
| Per workflow, vendor's figure | $0.000081 | $0.013880 |
| Claimed aggregate | — | 193.6× faster, 444.6× cheaper |

Output being free is not a pricing gimmick, it is a statement about the architecture: there is no
decode phase to charge for. In practice it means the cost of a call is the cost of the state you
sent, and the twentieth question you attach is free. That is a genuinely different unit economics
than anything else on the market, and it invalidates a habit — the careful rationing of model
calls that every team with an AI feature has internalized over the last three years.

Independent figures, where they exist, are in the same neighbourhood. Every's test ran 777
judgments across 37 documents in under 0.7 seconds for roughly a quarter of a cent, and estimated
Jev at about 25× faster and 1/580th the cost of Claude Fable 5.1 on a classification task. Early
users report a few thousand requests costing single-digit dollars; a demo running ten calls a
second cost about $7 an hour.

The Register raised the obvious counterpoint at launch, and it is the right one: **Jevons
paradox.** Make a resource radically cheaper and total consumption tends to rise rather than
fall. If a judgment costs a thousandth of what it did, teams will not spend a thousandth as much
— they will ask a hundred times more questions. Budget accordingly, and expect the line item to
grow even as the unit price collapses. That is not an argument against adopting it. It is an
argument for putting the per-call and per-workflow cost on a dashboard on day one, while the
numbers are still small enough that nobody is frightened of them.

### The 32k budget is the real constraint

Everything above makes the model sound unconstrained. It is not — it is constrained somewhere
unfamiliar.

A ~32,000 token request budget, shared between state and questions, means **state assembly is
your engineering problem now.** Not prompt engineering: state selection. Which fields, which
history, which retrieved documents, how truncated. The questions are cheap; the context is the
scarce resource, and it is the same scarcity a cache designer works with — what gets a slot, and
what gets evicted.

Practically this means three things, and they are ordinary systems work:

- **Select, don't dump.** Send the fields the questions actually reference. A serialized ORM
  entity with forty columns spends budget on data no question asks about, and — because it is
  billed by the token — you are paying for it every call.
- **Cache the state, not the answer.** Answers are cheap to recompute and go stale in ways you
  cannot see. The expensive part is assembling the state: the joins, the retrieval, the
  normalization. That is the layer that deserves the cache.
- **Chunk the way you would shard.** Anything larger than the budget becomes several calls with a
  combination step in your code, which is your design decision, not the model's. Doing it
  explicitly is better than discovering the truncation.

### The harness you have to run yourself

The calibration claim is the product. It is also, right now, unverified in public: no published
reliability curves, no paper, no weights, no disclosed architecture or parameter count, and one
small independent evaluation.

That is not a reason to stay away. It is a reason to build the measurement yourself, before the
thresholds go anywhere near production — and the measurement is not difficult, which is the good
news buried in this whole story.

```bash
# 1. Take real traffic, label it by hand. Several hundred cases, not thirty.
# 2. Run it through the same questions you will ship.
# 3. Bucket the answers by stated confidence and compare to observed accuracy.
#
#    bucket   n     stated   observed   gap
#    0.9–1.0  412   0.95     0.93       -0.02   <- usable
#    0.8–0.9  180   0.85     0.71       -0.14   <- your 0.9 gate is not a 0.9 gate
#    0.7–0.8   96   0.75     0.68       -0.07
#
# 4. Set thresholds from the observed column. Never from the stated one.
# 5. Re-run it monthly against fresh traffic, and after every rubric edit.
```

That table is the entire discipline. It tells you where your automation line actually sits rather
than where the vendor's documentation suggests it might, it is the only way to notice calibration
decaying under distribution shift, and it converts "we trust the model" into a number with a date
on it. It is also the artifact to show anyone who has to sign off on automating a decision with
money attached.

Run it per question, not per model. Calibration is not a single global property — it holds better
on some judgments than others, and the one that is weakest is rarely the one you expected.

### The baseline nobody runs

Which raises the question the launch material does not address, and it is the one to ask before
taking on a new vendor dependency: **is this a frontier model, or a very good encoder with
classification heads?**

Nobody outside TypeSafe can answer it. There is no paper, no weights, no parameter count, no
architecture description. But the shape of what is being described — fixed option sets, parallel
independent heads over a shared encoding of the input, a distribution per head, no decoder, a
32k context and a hard ceiling of 255 options — is also an exact description of a well-built
multi-head classifier, which is a thing the field has known how to build since BERT. That is not
an accusation of anything. A classifier trained superbly, on enormous data, with calibration as
the optimization target, would be a genuinely valuable product. It does mean the word *frontier*
is carrying weight the published evidence does not yet support.

It also means the comparison table quietly omits two baselines, and both are available to you
today with no waitlist:

- **A cascade using the models you already have.** FrugalGPT demonstrated this in 2023 — cheap
  model first, escalate when the answer is not confident enough — and reported cost reductions of
  up to 98% against always calling the best API, at matched quality. The two-tier architecture
  earlier in this post is not a Jev feature. It is a pattern that predates it by three years, and
  the savings it reported are the same order as the ones being claimed now.
- **A fine-tuned encoder on your own labels.** For a fixed taxonomy where you have labelled data,
  a distilled encoder classifier runs one to two orders of magnitude faster than an LLM on the
  same classification work, costs less per call than any hosted API, and — the part that matters
  for a dependency — you own the weights. It cannot be deprecated, repriced, or quietly retrained
  underneath you between Tuesday and Thursday.

So the honest framing of the value here is not "faster than a frontier model". It is **the
zero-label case**: classifier economics without having to collect a training set, fix a taxonomy
up front, or run a training pipeline — and the questions change with a text edit instead of a
retrain. That is a real product, and a substantial one. It is a narrower claim than the landing
page makes, and it puts the comparison where it belongs: against the encoder you would otherwise
have fine-tuned, not against the chat model you should never have been using for this.

### What the vendor's own numbers say about accuracy

Worth putting plainly, because the speed and cost figures have crowded it out of most coverage.

On TypeSafe's own workflow evaluation — 711 cases across security incidents, observability,
invoicing and customer support — Jev scored **67.8% aggregate accuracy against 74.1% for the best
comparator**. Per workflow: security 61.7 against 66.2, observability 71.6 against 76.6, support
76.0 against 78.3, and invoicing 61.8 against 79.1.

Three caveats, all of which cut in different directions. The reference labels were produced by
averaging GPT-6 Astra and Claude Fable 5.1 at high reasoning settings — so the comparators were
being graded against a standard derived from themselves, which flatters them. TypeSafe designed
the workflows, which flatters Jev. And Every's independent run found the speed and cost claims
survived contact with a third party while accuracy sat "a notch below the frontier" — 6 of 7
planted defects caught against 7 of 7 — on a sample too small to conclude anything from.

The invoicing gap is the one to look at, because it is a seventeen-point spread on the workflow
that most resembles handling money. That is the shape of the honest conclusion: this is a
component for high-volume judgments where a known error rate is acceptable and a wrong answer is
recoverable — routing, triage, classification, guardrails, verification passes, first-pass
scoring. It is not, on this evidence, a component to put in front of an irreversible financial
decision without a person on the other side of the gate.

## The short version

- **It returns values, not prose.** Three primitives — pick one, place on a rubric, is this true —
  and nothing else. Schema conformance is a property of the output space, not an achievement of
  the model.
- **"Can't hallucinate" means structurally valid, not correct.** A model forced to pick one of
  your three options will pick one even when the answer was a fourth. Always include the escape
  hatch, and alert on how often it wins.
- **The calibration problem is self-inflicted.** OpenAI's own GPT-4 report shows pre-training
  producing a calibrated model and post-training flattening it. RLCD reads as an undo rather than
  a frontier — still worth paying for, because nobody else is selling one.
- **Verbalized confidence is not a substitute.** Ask a model in words how sure it is and it
  answers near the top of the scale almost regardless of whether it is right — around 94% on
  average in one evaluation.
- **The calibrated confidence is the actual product.** It gives your code a second axis, and
  moves the policy out of a prompt and into reviewable code.
- **Calibration describes a population, never the answer in front of you.** Build routing on it;
  do not build a guarantee on it.
- **Thresholds belong to the action, not the model.** A tag and a refund do not share a number,
  and the ladder has to be written down before an incident writes it for you.
- **Decompose into many small questions.** They are evaluated in parallel and in isolation, the
  state is billed once, and the small answers are the only explanation you are going to get.
  Much of the measured gain comes from the decomposition itself — which you can do today, with
  the model you already have.
- **Two tiers.** Cheap typed path for everything, frontier model for the uncertain tail, a person
  for the residue. Exercise every rung in normal operation, and alert on the escalation rate
  rather than the error rate.
- **Latency is structural, not tuned.** No decode chain means sub-second answers, nothing to
  stream, and judgments that fit inside a synchronous request — which deletes a lot of queue-and-
  callback scaffolding that only ever existed to hide slowness.
- **The speed is an arithmetic-intensity story, not a cleverness story.** Autoregressive decode
  streams every weight out of memory per token and runs at under one percent of the hardware's
  compute capability. One parallel pass is compute-dense. It is the same insight speculative
  decoding exploits, taken further.
- **Ask what the baseline is before you sign up.** A FrugalGPT-style cascade over models you
  already have reported up to 98% savings in 2023, and on a fixed taxonomy a fine-tuned encoder
  beats both — with weights you own. The real claim here is the zero-label case, not raw speed.
- **The scarce resource moved.** Calls are nearly free; the ~32k shared budget for state and
  questions is the constraint, so state selection and state caching are the new engineering work.
- **Run your own calibration harness before your thresholds do anything.** Bucket by stated
  confidence, compare to observed accuracy, set the gates from the observed column, re-run
  monthly. Per question, not per model.
- **Accuracy sits a notch below frontier on the vendor's own evaluation** — 67.8% against 74.1%,
  and seventeen points down on invoicing. Suited to high-volume recoverable judgments; not to
  irreversible ones without a human gate.

---

*Sources. TypeSafe's launch write-up,
[Introducing System One Models & Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev),
and the product documentation at [docs.typesafe.ai](https://docs.typesafe.ai/introduction) —
the [primitives](https://docs.typesafe.ai/primitives), [confidence](https://docs.typesafe.ai/confidence)
and [patterns](https://docs.typesafe.ai/patterns) pages carry the code and the threshold guidance
quoted here. The Register's launch coverage,
[TypeSafe AI debuts model for machines that plays Doom](https://www.theregister.com/ai-and-ml/2026/09/16/typesafe-ai-debuts-model-for-machines-that-plays-doom/),
has the funding, the founder background and the Jevons point. Independent analysis and the
decomposition finding: Anthony Maio,
[Jev: The Language Model That Won't Talk](https://anthonymaio.substack.com/p/jev-the-language-model-that-wont).
A careful summary of what is known against what is merely claimed, including the per-workflow
accuracy table and the independent test figures:
[Jev: TypeSafe's Decision Model, Speed and Cost Explained](https://www.orcarouter.ai/blog/jev-typesafe-system-one-what-we-know).
Every benchmark number above is the vendor's unless named otherwise — that distinction is the
most important thing in this post.*

*The supporting literature, for the claims that are not TypeSafe's. The calibration figure is
from OpenAI's GPT-4 Technical Report
([arXiv:2303.08774](https://arxiv.org/abs/2303.08774)), which reports the pre-trained model as
well calibrated and post-training as reducing it; the foundational treatment is Chuan Guo, Geoff
Pleiss, Yu Sun and Kilian Weinberger, On Calibration of Modern Neural Networks, ICML 2017
([arXiv:1706.04599](https://arxiv.org/abs/1706.04599)) — also the source of temperature scaling
and expected calibration error. On verbalized confidence being unreliable: On Verbalized
Confidence Scores for LLMs ([arXiv:2412.14737](https://arxiv.org/abs/2412.14737)). The
structured-output accuracy figures come from evaluations of grammar-constrained decoding,
including JSONSchemaBench ([arXiv:2501.10868](https://arxiv.org/abs/2501.10868)). The cascade
baseline is Lingjiao Chen, Matei Zaharia and James Zou, FrugalGPT
([arXiv:2305.05176](https://arxiv.org/abs/2305.05176)). The arithmetic-intensity account of why
decoding is slow follows the speculative decoding literature — see Accelerating LLM Inference
with Staged Speculative Decoding ([arXiv:2308.04623](https://arxiv.org/abs/2308.04623)) for the
memory-bandwidth framing.*
