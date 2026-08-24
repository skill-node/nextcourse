# NextCourse

**An agent that designs courses — and then builds the deck.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-20.x-informational.svg)](https://nodejs.org)
[![Dependencies: zero](https://img.shields.io/badge/npm%20dependencies-0-success.svg)](./package.json)
[![Reveal.js](https://img.shields.io/badge/output-Reveal.js%20HTML-orange.svg)](https://revealjs.com)

[中文说明 →](./README.zh-CN.md) · [Live demo: a complete 29-slide course ↗](https://course.skillnode.ai/demo/) · [Live demo: a nine-document delivery pack ↗](https://course.skillnode.ai/package/) · [Theme gallery ↗](https://course.skillnode.ai/gallery/)

---

A professional trainer delivers dozens of sessions a year. The time never goes into
the two hours on stage — it goes into the preparation: positioning that keeps
drifting, learning outcomes that end up as well-phrased nothing, slides still not
right at midnight. Swap the audience, and much of it starts over.

**Most of NextCourse's effort goes into the part before the slides.** Positioning,
learning outcomes, knowledge structure. Once those are settled, the deck is the easy
part — and it is *derived* from them rather than poured into a template.

## This is not a deck generator

There are already plenty of agents and skills that turn a topic into slides. That is
the smaller half of the problem, and the half NextCourse spends the least effort on.

|  | Deck generators | NextCourse |
|---|---|---|
| **Starts at** | "I already know what I'm teaching" | "I need to design a course" |
| **Input** | A topic or an outline you wrote | A conversation, one question at a time |
| **Decides** | Layout | Audience, outcomes, sequence — *then* layout |
| **Learning design** | Not modelled | Bloom-levelled outcomes, Merrill's First Principles |
| **Artifact** | A deck | A reviewable outline file, then a deck derived from it |

A deck generator assumes you already know who the course is for, what they should be
able to *do* afterwards, and how it should be sequenced. That assumption skips the
hardest, slowest and most easily fudged part of the job.

The design judgement stays with you. What the agent takes over is asking for those
judgements one at a time, writing them down, and then executing them strictly.

## Course design: one question at a time

Run `/course-design` in Claude Code. Entirely conversational, landing in a file a
human can read, edit and put under version control — not an opaque black box.

**0 · Spec and needs diagnosis** — The first question is *how long, what setting*,
because that decides how much else needs asking. A 30-minute public talk and a
one-day in-house workshop differ by an order of magnitude in design depth; serving
both with one flow either overburdens the light case or shortchanges the heavy one
(see *Scales* below). For in-house scales it also asks something most people skip:
**what this run explicitly will not cover** — ask only what is wanted and never what
isn't, and a course grows fat every time.

**1 · Positioning** — Who the audience is, the situation they will use it in, why
this course rather than another. It asks one or two questions and waits.

**2 · Learning outcomes** — Three to five, each led by a Bloom verb and paired with a
success criterion. This is the foundation everything else is derived from:

```yaml
# course.meta.md
outcomes:
  - do:      "Judge whether a routine task is worth handing to an agent"
    bloom:   analyze
    success: "Given 3 work scenarios, say which calls for a chat box, which calls
              for an agent, and which should not use AI — with reasoning"
```

`do` is an observable behaviour led by a verb, `bloom` the cognitive level, `success`
the acceptance criterion. *"Give learners an understanding of AI"* is not an outcome —
it is a sentence nobody can grade. If every outcome sits at *remember / understand*,
the agent tells you the course is probably too shallow. That is a quality gate, not a
suggestion.

**3 · Knowledge structure** — Modules get split out and laid down as
**Hook → Concept → Demo → Practice → Takeaway** (Merrill's First Principles of
Instruction), each module leaving exactly one sentence a learner can repeat on the way
out.

### One rule worth stealing: keep the skeleton and the cases apart

The same course often has to be taught to different industries. If industry cases seep
into the general modules, changing audience means rewriting the course. So the outline
carries an explicit constraint: **no industry cases in the skeleton modules**, all of
them concentrated in one. Swap audience, rewrite that layer only.

## Scales: keep the light case light

A 60-minute public talk needs no Kirkpatrick evaluation, no scoring rubric, no learner
workbook. Forcing a full corporate-training methodology onto it just turns the tool
into a burden. Hence three scales:

| Scale | For | Output |
|---|---|---|
| **S · Talk** (default) | 30–90 min, public or internal talk | `course.meta.md` + deck |
| **M · Workshop** | Half-day to a full day, in-house training | + design blueprint + delivery package |
| **L · Programme** | Bootcamps, systematic programmes | + operations, train-the-trainer, rollout roadmap |

`nextcourse new <name>` with no flag is S, **behaving exactly as it did before this
layer existed** — a hard constraint, because the light case should not pay for someone
else's complexity. Add `--scale M` for the in-house case.

## In-house training: from outline to delivery package

In real in-house delivery the deck is one item among many. The learner workbook, the
exercise data pack, the scoring rubric, the evaluation survey, the action-commitment
sheet — those decide whether the course actually lands.

`/course-delivery <name>` picks up where `/course-design` stops: facilitation design,
Kirkpatrick evaluation (**L1 + L2 by default**; L3/L4 only once you have named who
supplies the baseline data), content development plan. Then one command ships the lot:

```bash
node nextcourse.js package <name> --render
```

```
package/
├── 1_facilitator-guide.md  Facilitator guide (teaching points, activity scripts, slide notes)
├── 2_workbook.md           Learner workbook (tasks, write-in areas, self-check lists)
├── 3_rubric.md             Scoring rubric (dimension x level, every cell an observable behaviour)
├── 4_action-plan.md        Learner 30-day action commitment
├── 5_assessment.md         Evaluation plan (L1 survey + L2 assessment)
├── 6_facilitation.md       Facilitation design (timeline, grouping, points rules)
├── 7_alignment.md          Alignment matrix (generated by check)
├── 8_content-dev.md        Content development (SME interviews, case library, schedule)
└── html/                   What the client receives: opens on a double-click, prints without losing
                            styling. 0_index.html is the cover.
```

**Markdown is the source, HTML is the deliverable** — the same mental model as
`deck.html`: edit the md, re-render, never hand-edit the HTML. The renderer is a
hand-written controlled subset (~300 lines), because **zero npm dependencies** is a
deliberate moat here and markdown rendering is not worth breaking it for.

### Backward design that actually errors

Two extra fields on an outcome are all it takes to make *taught but never assessed* and
*assessed but never taught* machine-detectable:

```yaml
outcomes:
  - id: LO3
    do:       "Complete one real work task using an office agent"
    bloom:    apply
    success:  "Output is usable as-is, no rework needed"
    module:   3                       # where it is taught
    evidence: "Capstone kit, item A"  # what proves it was achieved
```

`nextcourse check <name>` validates teaching logic, not styling:

- every outcome is taught by a module and proven by evidence — missing either is an error;
- blueprint module list, outline page counts and actual files in `slides/` must agree;
- a Bloom distribution stuck at *remember / understand* warns that the course is shallow;
- module durations summing past the declared total is an error;
- a module with a teaching activity in the blueprint must have a matching activity page in the deck.

Backward design is a slogan in most courses because nobody checks. Here it is a check
that fails.

## Slides: what happens after the outline is settled

`/slide-design <name>` — with two human review gates, because content problems are one
line to fix in a plan and a re-layout to fix in HTML.

- **Content clears first.** A page-by-page `slide-plan.md` goes to you before any
  markup is written. No layout time spent on the wrong content.
- **Pages are typed.** Each page is declared Hook / Concept / Demo / Practice /
  Takeaway first, and the type decides which of the 24 registered components it may use.
- **Machine-checked, not eyeballed.** Inline styles, hard-coded colours, smuggled
  `font-family`, unregistered classes — five violation types fail the build. Then a
  headless Chrome screenshots every page to catch content overflowing the frame.
- **Re-skin in one line.** Palette (8 schemes) and typeface (8 font sets) are a
  separate layer. Changing the look touches no slide.
- **The deliverable is a folder.** Fonts, scripts, images and licences all packaged in.
  Dead conference-room wi-fi, nothing installed on the client's laptop — it still opens
  on a double-click.

## Why the output is HTML, not PowerPoint

This is a deliberate choice, and it is the other half of the argument.

A deck written as HTML is an **AI-native artifact**. Change one sentence and only that
sentence moves. Re-skin an entire course in a single line. Every layout rule can be
checked page by page by machine — which is exactly what the linter and the screenshot
pass do above. A `.pptx` is a binary blob; a model can only guess at it from the
outside, and what it guesses is neither flexible nor precise enough to be checked.

Because it is HTML on Reveal.js, you also keep everything projection actually needs:
speaker notes on a second screen, PDF export, fragments and transitions, offline
playback, arrow-key navigation, any aspect ratio.

The cost is a small learning curve for trainers used to PowerPoint: no more dragging
text boxes and nudging font sizes — the effort goes back into the content itself. For
this trade there is a longer-term argument too. As more of a trainer's work runs
through AI, the file formats that models can read, diff and verify are the ones that
compound. Choosing HTML over `.pptx` is choosing to work in a format your tools can
actually reason about.

## Quick start

Requires **Node 20.x** and, for the screenshot pass, a local **Chrome / Chromium /
Edge**. There is nothing to `npm install` — the CLI runs on Node built-ins alone.

```bash
git clone https://github.com/skill-node/nextcourse.git
cd nextcourse
```

Then, in Claude Code:

```
/course-design                 # conversational: spec → positioning → outcomes → design → modules
/course-delivery <course-name> # in-house scales: facilitation → evaluation → content plan
/slide-design <course-name>    # plan → review → slides
```

And from the shell:

```bash
node nextcourse.js render <name>   # lint + build deck.html  (recommended)
node nextcourse.js check  <name>   # teaching-design closure check (outcome x module x evidence)
node nextcourse.js package <name> --render   # delivery package: md source + client HTML (M/L)
node nextcourse.js shot   <name>   # overflow check + per-page screenshots
node nextcourse.js export <name> --with-package   # package as an offline-playable folder
node nextcourse.js animate <name>  # batch entrance animations (--strip to remove)
node nextcourse.js themes          # build the palette / typeface gallery
```

`node nextcourse.js` with no arguments lists every command; see
[CLI_MANUAL.md](./CLI_MANUAL.md) for the full reference.

### Run the bundled examples

[`examples/`](./examples) ships **the same subject at two scales**, which is the
clearest way to see what the scale actually changes:

| Example | Scale | Contents |
|---|---|---|
| `ai-agent-insurance` | S · Talk | 60 min, 29 slides — the one on the [live demo](https://course.skillnode.ai/demo/) |
| `ai-agent-insurance-workshop` | M · Workshop | Full day, 31 slides, plus design blueprint and full delivery package — the pack on the [live demo](https://course.skillnode.ai/package/) |

All case materials in both are replaced by fabricated samples. Copy one in and build it:

```bash
cp -R examples/ai-agent-insurance-workshop courses/
node nextcourse.js check   ai-agent-insurance-workshop   # closure check: 0 errors, 0 warnings
node nextcourse.js render  ai-agent-insurance-workshop   # lint + build the deck
node nextcourse.js package ai-agent-insurance-workshop --render   # delivery package HTML
```

Read `course.blueprint.md` and `course.meta.md` first — those files, not the deck, are
what this project is really about. `package/7_alignment.md` is worth a separate look:
outcome x module x activity x evidence, the whole loop in one table.

## Repository layout

```
nextcourse/
├── AGENT.md                     ← full documentation (entry point for any agent)
├── CLI_MANUAL.md                ← complete CLI reference
├── DESIGN-SYSTEM.md             ← component reference (24 components)
├── nextcourse.js                ← single CLI entry point
├── build.js                     ← course assembly
├── check.js                     ← teaching-design closure check
├── package.js                   ← delivery package generation
├── render-md.js                 ← controlled-subset md → html renderer (zero deps)
├── lint-slides.js               ← style gate (5 violation types)
├── animate-slides.js            ← batch entrance animations
├── export.js                    ← offline packaging
├── shot.js                      ← overflow detection + screenshots
├── templates/                   ← deck.html master template + design blueprint (M/L)
├── shared_styles/               ← design system (8 palettes · 8 font sets · components)
├── lib/                         ← Reveal.js + webfonts (vendored, offline-capable)
├── .claude/skills/
│   ├── course-design/SKILL.md   ← /course-design
│   ├── course-delivery/         ← /course-delivery (Kirkpatrick and other references)
│   └── slide-design/SKILL.md    ← /slide-design
├── examples/                    ← bundled example course
└── courses/                     ← your courses (gitignored)
```

## Language

The agent **follows your language** — ask in English and the whole conversation, the
outline and the slides come back in English.

The documentation is not symmetric, and it would be dishonest to imply otherwise:

| Document | Language |
|---|---|
| `README.md`, `README.zh-CN.md` | English + Chinese |
| `CLI_MANUAL.md` | Chinese, with [`CLI_MANUAL.en.md`](./CLI_MANUAL.en.md) in English |
| `AGENT.md`, `DESIGN-SYSTEM.md` | **Chinese only** (~1,300 lines; a translation is a separate project) |
| `.claude/skills/*/SKILL.md` | Chinese prompts — but they instruct the agent to reply in your language |

One known rough edge: the linter's *density warnings* (headline ≤ 15 characters, list
item ≤ 20) are calibrated for Chinese, where one character is one glyph. On English
slides they over-fire. They are warnings only — never a build failure — but expect
noise until they are made script-aware.

## Licence

MIT — see [LICENSE](./LICENSE). Use it, fork it, teach with it, sell the training you
build with it.

NextCourse bundles Reveal.js, Font Awesome Free and seven webfonts so that exported
courses play offline. Those carry their own licences (MIT · CC BY 4.0 · SIL OFL 1.1),
all reproduced in [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md) and copied into
every exported folder.

## Status

There is no commercial plan for this tool. It is built and changed weekly inside real
delivery work, and it is open-sourced because if you also teach for a living, it should
be useful to you. Issues and forks welcome; no roadmap promised.

Built by Kurtlee — an HR director of twenty years who builds AI products. More at
[nextskill.cc](https://nextskill.cc).
