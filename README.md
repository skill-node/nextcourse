# NextCourse

**An agent that designs courses — and then builds the deck.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-20.x-informational.svg)](https://nodejs.org)
[![Dependencies: zero](https://img.shields.io/badge/npm%20dependencies-0-success.svg)](./package.json)
[![Reveal.js](https://img.shields.io/badge/output-Reveal.js%20HTML-orange.svg)](https://revealjs.com)

[中文说明 →](./README.zh-CN.md) · [Live demo: a complete 29-slide course ↗](https://course.skillnode.ai/demo/) · [Theme gallery ↗](https://course.skillnode.ai/gallery/)

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

## Course design: three phases, one question at a time

Run `/course-design` in Claude Code. Entirely conversational, landing in a file a
human can read, edit and put under version control — not an opaque black box.

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

## Slides: what happens after the outline is settled

`/slide-design <name>` — with two human review gates, because content problems are one
line to fix in a plan and a re-layout to fix in HTML.

- **Content clears first.** A page-by-page `slide-plan.md` goes to you before any
  markup is written. No layout time spent on the wrong content.
- **Pages are typed.** Each page is declared Hook / Concept / Demo / Practice /
  Takeaway first, and the type decides which of the 22 registered components it may use.
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
/course-design                 # conversational: positioning → outcomes → structure
/slide-design <course-name>    # plan → review → slides
```

And from the shell:

```bash
node nextcourse.js render <name>   # lint + build deck.html  (recommended)
node nextcourse.js shot   <name>   # overflow check + per-page screenshots
node nextcourse.js export <name>   # package as an offline-playable folder
node nextcourse.js animate <name>  # batch entrance animations (--strip to remove)
node nextcourse.js themes          # build the palette / typeface gallery
```

`node nextcourse.js` with no arguments lists every command; see
[CLI_MANUAL.md](./CLI_MANUAL.md) for the full reference.

### Run the bundled example

A complete 29-slide course ships in [`examples/`](./examples) — the same one on the
[live demo](https://course.skillnode.ai/demo/), with all case materials replaced by
fabricated samples. Copy it into your workspace and build it:

```bash
cp -R examples/ai-agent-insurance courses/
node nextcourse.js render ai-agent-insurance
node nextcourse.js export ai-agent-insurance
```

Read `examples/ai-agent-insurance/course.meta.md` first — that file, not the deck, is
what this project is really about.

## Repository layout

```
nextcourse/
├── AGENT.md                     ← full documentation (entry point for any agent)
├── CLI_MANUAL.md                ← complete CLI reference
├── DESIGN-SYSTEM.md             ← component reference (22 components)
├── nextcourse.js                ← single CLI entry point
├── build.js                     ← course assembly
├── lint-slides.js               ← style gate (5 violation types)
├── animate-slides.js            ← batch entrance animations
├── export.js                    ← offline packaging
├── shot.js                      ← overflow detection + screenshots
├── templates/                   ← deck.html master template
├── shared_styles/               ← design system (8 palettes · 8 font sets · components)
├── lib/                         ← Reveal.js + webfonts (vendored, offline-capable)
├── .claude/skills/
│   ├── course-design/SKILL.md   ← /course-design
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
