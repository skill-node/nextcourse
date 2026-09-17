# NextCourse CLI Manual

> [中文版 →](./CLI_MANUAL.md) · This is a translation of `CLI_MANUAL.md`; if the two
> ever disagree, the Chinese file is the one kept in step with the code.

## Short answer

**After editing a slide's HTML, the command to rebuild and look at it is:**

```bash
npm run render <course-name>
# or
nextcourse render <course-name>
```

---

## Full command reference

### Basics

#### `list` — list every course and its state

```bash
npm run list
```

An overview of every course in the project:

- whether an outline exists (`course.meta.md`)
- how many slides
- whether `deck.html` has been built
- whether it has been exported

**Sample output:**

```
NextCourse — 课程列表
────────────────────────────────────────────────────────────
  python-basics               ✓ meta  ✓ 12 slides  ✓ deck  ✓ export
  advanced-django             ✓ meta  ✓ 8 slides   · deck  · export
```

---

#### `new` — scaffold a new course

```bash
npm run new <course-name>
# or
nextcourse new <course-name> [--scale M|L]
```

Creates:

- `courses/<course-name>/course.meta.md` — outline template
- `courses/<course-name>/slides/` — slide fragments
- `courses/<course-name>/assets/` — images

**Scale (`--scale`)**: no flag means **S** (a 30–90 minute talk) and behaves exactly as
it did in V2.

| Scale | For | Extra output |
|---|---|---|
| S (default) | Public or internal talk | — |
| M | Half-day to full-day in-house training | `course.blueprint.md` plus `scale` / `duration` / `class_size` in the frontmatter |
| L | Bootcamp or systematic programme | Same as M; the blueprint also carries operations, TTT and roadmap sections |

At M/L the `outcomes` use the block form and carry `id`, `module` (where it is taught)
and `evidence` (what proves it). Those three fields are the fuel for `check`.

**Example:**

```bash
npm run new python-basics                             # S
nextcourse new leadership-workshop --scale M  # M, blueprint included
```

---

### Development workflow

#### `compose` — preview or materialize a composed course

```bash
nextcourse compose <course-name> [--recipe <id>] [--dry-run]
```

Use this only for a course with `course.compose.json`. `--dry-run` resolves public
exports and re-export chains, diagnoses cycles, diamond paths and version conflicts,
and reports workspace candidates without writing. Accept the plan explicitly with
`sync --apply`; with a matching lock, regular `compose` materializes `.build/<recipe>/`
from that lock without accepting upstream updates.

For a composed course, `build`, `render`, `lint`, `check`, `notes`, `export`, `pdf`
and `shot` automatically use the locked recipe view. They do not overwrite the design
source or hand-authored root slides. A hand-edited generated view is rejected; save
the change as local source or a variant. Delivery-package adaptation is scheduled for
the delivery phase, so `package` currently refuses composed courses.

```bash
nextcourse compose office --recipe workshop --dry-run
nextcourse sync office --recipe workshop --dry-run
nextcourse sync office --apply <plan-id>
nextcourse compose office --recipe workshop
nextcourse render office --recipe workshop
```

#### `validate` / `trace` / `impact` / `sync` — composition maintenance

```bash
nextcourse validate office [--recipe workshop] [--json]
nextcourse trace office <entity-or-instance-id|page-number> [--json]
nextcourse impact <source-id> [--json]
nextcourse sync office [--recipe workshop] [--dry-run] [--json]
nextcourse sync office --apply <plan-id>
nextcourse check --workspace [--json]
```

`validate` and `check --workspace` are read-only and never write the legacy alignment
report. `trace` exposes the full re-export and page provenance; `impact` separates
direct and transitive locked consumers and marks frozen instances. `sync` only previews
candidate versions and file diffs by default. Applying requires a conflict-free plan ID
whose compose, lock and source baselines still match. Frozen items remain pinned, while
an upstream change to a variant produces three-way review data and is never overwritten.
`--json` exposes the same machine-readable results intended for the local studio.

---

#### `lint` — check slides against the design system

```bash
npm run lint <course-name>
```

Scans `slides/*.html`. **Reports only; never edits your files.**

**Five violation types** — any hit exits 1, which aborts `render`:

| Violation | Meaning |
|---|---|
| `inline-style` | a `style="..."` attribute is present |
| `hardcoded-hex` | a hex colour written inside a `<style>` block |
| `hardcoded-rgb` | `rgb()` / `rgba()` written inside a `<style>` block |
| `new-font` | `font-family` declared in a `<style>` block (use a `var(--font-*)` token) |
| `unknown-class` | a CSS class that is not registered in the design system |

**Four density warnings** — reported, never fatal: `h2-too-long` (heading > 15
characters), `item-too-long` (list item > 20), `too-many-items` (more than 6 items in
one list), `long-paragraph` (paragraph > 80 characters — use a list or a component).

> The density thresholds are calibrated for CJK text, where one character is one glyph.
> Languages counted in words will trip them constantly. They are warnings only and
> never fail the build.

---

#### `animate` — batch-apply or strip component entrance animations

```bash
npm run animate <course-name>            # apply, by rule
npm run animate <course-name> -- --strip # remove all of them, back to static
npm run animate <course-name> -- --dry   # report what would change, write nothing
```

Adds `animate-*` / `stagger-*` to slide elements based on component structure, so that
turning to a page brings its parts in one after another. It rewrites the
`slides/*.html` **sources** (not `deck.html`), so you still need `render` to see the
result.

**Rules** — they cover every component in DESIGN-SYSTEM.md, not just the ones a given
course happens to use; defined as `CONTAINER_RULES` / `SOLO_BLOCKS` in
`animate-slides.js`:

| Component | Effect |
|---|---|
| `vs-box` | two columns converge from left and right; in a three-column layout the middle one rises instead |
| `layout-text-image` / `layout-img-left` / `layout-img-right` | text and image converge |
| `workflow` | nodes and connectors enter along the direction of flow (fade-left) |
| `timeline` | events enter along the timeline (fade-left) |
| `grid-2` / `grid-3` / `grid-4` / `icon-card-grid` | cards rise in sequence |
| `stats-wall` | figures rise in sequence |
| `quadrant` | the four cells rise in sequence |
| `case-study__body` | the three panels rise in sequence |
| `layout-img-top` / `layout-top-bottom` | top and bottom blocks rise in sequence |
| `check-list` / `pill-list` / `key-takeaway__list` | list items rise in sequence |
| `concept-card` / `callout` / `highlight-box` / `table-compare` / `code-block` / `quote-slide` / `module-divider` / `case-study` / `key-takeaway` / a standalone `card*` | the block rises as a whole |

Cover pages (`cover-slide`) and ending pages (`ending-slide`) are skipped entirely.
Within one page, every animated element is numbered in document order, so the rhythm is
a single continuous run — you never get two groups both starting at `stagger-1` and
colliding.

**General fallback:** if a page runs through every rule and still matches nothing (an
unlisted component, or hand-written markup), the direct block-level children of
`<section>` each get `fade-up`, flagged as `⚙ 通用兜底` in the output. So the
consequence of "new component shipped, forgot to add a rule" is a flat rhythm rather
than a dead page. When you see that flag, consider adding a dedicated rule to
`CONTAINER_RULES`.

> When you add a component to the design system, add its animation rule too — the
> fallback keeps things safe, but it cannot produce structure-aware rhythms like
> "converge from both sides" or "advance along the flow".

**Division of labour with hand-written `fragment`**

`animate-*` is structural (which container gets which direction follows rules), so it
can be generated in bulk. `fragment` — appearing only on space/click — is *pedagogical*
rhythm; only the trainer knows which sentence should wait. This command treats
`fragment` as read-only:

- an element that carries `fragment`, or has an ancestor that does, is **never** given
  an `animate-*`
- `--strip` removes only `animate-*` / `stagger-*` tokens, and never touches `fragment`
  or any other class

So "hand-write fragments → `--strip` → edit content → `animate` again" can go round as
many times as you like with your rhythm markers preserved. The command is idempotent;
running it repeatedly gives the same result.

> ⚠️ **The same element must not carry both `animate-*` and `fragment`.**
> `animations.css`'s `.reveal .slides section.present .animate-fade-up` has specificity
> (0,4,1), which beats `reveal.css`'s `.reveal .fragment:not(.custom){opacity:0}`
> (0,2,0). Opacity resolves to 1 the moment the page turns, so the keypress produces a
> hard cut. For "triggered by keypress *and* smooth", use `class="fragment smooth"`.
> Different elements using different mechanisms is completely fine — A and B flying in
> automatically while C and D wait for the space bar, on the same page, is the
> recommended pattern.

---

#### `build` — assemble `deck.html`

```bash
npm run build <course-name>
```

Merges every HTML file in `slides/` into a single `deck.html`:

- wires up Reveal.js and its dependencies
- applies the template, palette and font set
- produces a file you can open on its own

**Output:** `courses/<course-name>/deck.html`

---

#### `render` — lint + build in one step (recommended)

```bash
npm run render <course-name>
```

In order:

1. run `lint`
2. if it passes, run `build` to produce `deck.html`

**This is the command you will use most after editing a slide.** ✨

**Typical loop:**

```bash
# 1. edit slides/slide-01.html
# 2. rebuild
npm run render python-basics

# 3. open it
open courses/python-basics/deck.html
```

---

#### `check` — teaching-design closure check

```bash
npm run check <course-name>
# or
nextcourse check <course-name>
```

`lint` covers styling; `check` covers **teaching logic**. It reads `course.meta.md`,
`course.blueprint.md` and `slides/`, and validates six things:

| Check | What it means |
|---|---|
| Closure | Every outcome needs `module` (taught) and `evidence` (assessed); at M/L either one missing is an **error** |
| Consistency | Blueprint module list ↔ outline modules ↔ actual files in `slides/` must agree |
| Depth | A Bloom distribution stuck at remember / understand warns the course may be too shallow |
| Activity landing | A module with a teaching activity in the blueprint must have an Activity page (`.activity-card`) in the deck |
| Duration | Module durations vs the declared total; overrunning is an error |
| Completeness | Missing mandatory blueprint sections at M/L |

It also writes `package/7_alignment.md` — the alignment matrix
(outcome × module × activity × deliverable × evidence).

**Exit code**: `1` when there are errors, `0` when only warnings. S-scale courses are
not forced into closure; they get a single informational line.

---

### Delivery workflow

#### `package` — build a delivery package (independent M/L or composed slides+lab/full)

```bash
npm run package <course-name>
# or
nextcourse package <course-name> [--render] [--force]
```

Independent courses keep the existing behaviour: M/L derives `package/` from the
blueprint, outline and notes, while S is refused. A composed `slides+lab` recipe may be
S-scale: locked cases seed separate student and facilitator drafts. A `full` recipe must
already contain all eight Markdown sources under `package-src/<recipe>/`.

For a composed course, editable sources live under the `student/` and `facilitator/`
branches of `package-src/<recipe>/` and are never overwritten. Generated material lives
under `.build/<recipe>/package/<audience>/`. Student output contains only student/both
materials; answers and generator scripts exist only in facilitator output. `--force`
continues to apply only to the legacy independent-course flow.

Pulls the blueprint, the outline and the slide notes together into what in-house
delivery actually requires:

| File | Read by |
|---|---|
| `package/1_facilitator-guide.md` | Facilitator — teaching points, activity scripts, matched slide notes |
| `package/2_workbook.md` | Learner — tasks, write-in areas, self-check lists |
| `package/3_rubric.md` | Facilitator — scoring rubric and tally sheet |
| `package/4_action-plan.md` | Learner — 30-day commitment plus 30/60/90 review |
| `package/5_assessment.md` | Client — L1 survey, L2 assessment, declared evaluation scope |
| `package/6_facilitation.md` | Facilitator / assistant — timeline, grouping, points rules |
| `package/7_alignment.md` | Internal — alignment matrix (written by `check`, untouched here) |
| `package/8_content-dev.md` | Project team — SME interviews, case library, data packs, schedule |
| `package/exercises/README.md` | Project team — data-pack rules and backlog |

**The number prefix is the delivery order.** The client receives a folder, and a file
manager sorts by name — so the sort order *is* their reading order: 1–4 are what has to
be on the table the day the course runs, 5–8 are the design and project-level evidence.
The cover renders as `html/0_index.html` and therefore always sorts first, and its
document list carries the same numbers. The order lives in `DOCS` in `package.js` (a
`no` per entry). Older courses whose package files have no prefix are **renamed in
place** on the next run; hand-edited content is preserved.

**Flags:**

- `--render` — also render `package/*.md` into `package/html/*.html`, the
  self-contained, printable files the **client actually receives**
- `--force` — regenerate and overwrite existing md (**by default nothing is
  overwritten**; your hand edits win)

**Markdown is the source, HTML is the deliverable** — the same model as `deck.html`.
Edit the md, re-render, never hand-edit the HTML.

**The heading and the tab say what the document *is*.** Each document's h1 is its
function — Facilitator Guide, Rubric, Assessment Plan — with the course title on a
smaller second line, and `<title>` carries the function alone. Clients open several of
these at once; leading every one with the same course title buries the only thing that
tells them apart, and makes every browser tab identical. Write the function as the h1 in
the md; the renderer adds the course title.

**One stylesheet for every course**: `shared_styles/package-doc.css` (light, printable).
The only thing that follows the course `theme` is the accent colour — the palette's
`--primary`, darkened to 4.5:1 on white. Change that file and every course changes.

Where blueprint sections 6–8 are missing, the corresponding documents carry
`> **待补**: …` markers — that is the backlog standing between this course and a real
cohort. Fill the blueprint via `nextcourse-delivery`, then run this again.

> An independent S course is still refused; an explicit composed `slides+lab` recipe is the exception.

**Print acceptance** (walk through Chrome's print preview after `--render`):
① backgrounds and header fills preserved ② consistent margins ③ no blank pages
④ tables not split ⑤ no heading stranded at the foot ⑥ forced breaks honoured
⑦ exported PDF matches the preview

---

#### `export` — package as an offline-playable folder

> Add `--with-package` to include rendered delivery material. Composed export defaults
> to `--audience student`; use `--audience facilitator` explicitly for the trainer bundle.

```bash
npm run export <course-name> [outdir]
```

Produces a self-contained presentation folder:

- everything the presentation actually uses is copied in (Reveal.js, this course's font
  subsets, images, CSS) with paths rewritten to be relative — not inlined into one HTML
  file, but a folder you can move as a whole
- only what this course needs: `lib/fonts/display` holds every font family (including
  two Chinese families at ~5 MB each), so files are picked by following what the
  course's font set actually `@import`s rather than copying the directory
- third-party licence texts travel with it (Reveal.js's `lib/LICENSE`, each font's
  `<slug>.LICENSE.txt`, Font Awesome's `LICENSE.txt`) — MIT and SIL OFL both require
  the notice to accompany a distributed copy, and an export folder is exactly that. See
  [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md)
- double-click `index.html` to present: no network, nothing to install
- size depends on the fonts: around 9–10 MB with Chinese subsets (the bundled 29-slide
  example comes to 9.4 MB across 174 files)

**Optional argument:**

- `outdir` — output directory (default `courses/<course-name>/export/`)
- `--with-package` — include the rendered package
- `--audience student|facilitator` — composed-package audience; defaults to `student`

**Structure:**

```
export/
├── index.html          (the presentation)
├── assets/             (course images)
├── shared_styles/      (the template / palette / font set this course uses)
└── lib/                (Reveal.js + fonts + their licence texts)
```

> A font with no licence text fails the export outright. When adding a font, add
> `lib/fonts/display/<slug>.LICENSE.txt` as described under "If you add a font" in
> [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md).

**Examples:**

```bash
# default: courses/python-basics/export/
npm run export python-basics

# custom location
npm run export python-basics /tmp/my-export
```

---

#### `notes` — export the trainer handout

```bash
npm run notes <course-name>
```

Builds a handout from every slide's speaker notes (`<aside class="notes">`).

**Output:** `courses/<course-name>/handout.md`

**Contains:**

- each slide's number and title
- its speaker notes, with HTML stripped
- a summary (total slides, how many carry notes)

**Note:** re-run it after editing notes; do not edit `handout.md` directly — it is
generated.

**Example:**

```bash
npm run notes python-basics

# ✓  讲师手册已生成: courses/python-basics/handout.md
#    共 12 页, 其中 10 页有演讲备注
```

---

#### `pdf` — export a PDF (the deck you hand to learners)

```bash
npm run pdf <course-name>
# or
nextcourse pdf <course-name> [output.pdf] [--theme <scheme>] [--size WxH] [--keep] [--source <file>]
```

Prints `deck.html` to a PDF, one slide per page, with the palette, typefaces and layout
exactly as they look on screen (needs a local Chrome):

```
courses/<course-name>/pdf/deck.pdf              # default output (the teaching palette)
courses/<course-name>/pdf/deck.print-light.pdf  # with --theme print-light
```

A course accumulates several PDFs over time (the teaching one, the printable one, a trimmed
one for sending out, a renamed copy), so they all land under `pdf/` and the course root keeps
only source files.

**Do not tell people to hit Cmd+P in the browser.** reveal.css ships a print stylesheet
built for paper (`@media print`): white background, 20pt black body text, decoration hidden.
What comes out is unusable — that stylesheet is exactly what this command routes around.

**Arguments:**

- `output.pdf` — output path (default `courses/<course-name>/pdf/deck.pdf`; an explicit path wins)
- `--theme <scheme>` — export with a different colour scheme; layout and typefaces do not move
  a pixel. Use `--theme print-light` for something learners can print (below); any existing
  scheme name works. The output filename gets a suffix, so it never overwrites the teaching PDF
- `--size WxH` — page size, default `1600x900` (16:9); use `--size 1600x1200` for 4:3 projectors
- `--keep` — keep the print copy as `deck.print.html` (open it in a browser to preview, or edit it)
- `--source <file>` — print a file from the course directory, normally a hand-edited `deck.print.html`

---

##### The deck you teach from is not the deck you send out

Live demos and client-sensitive cases often should not leave the room. Two routes, pick by how
much has to change:

**Drop whole pages (preferred)** — add one attribute to the `<section>` in `slides/slide-XX.html`:

```html
<section data-print="off">
```

That page is dropped at export time. Page numbers are a CSS counter, so **they stay consecutive**;
the attribute has no effect on the presentation, and the teaching `deck.html` still carries the
page. One source of truth, in `slides/`, and a rebuild never loses it.

**Change the content** — keep the print copy, edit it, print from it:

```bash
nextcourse pdf my-course --keep                     # PDF, plus deck.print.html
# edit deck.print.html: cut half a page, add a "how to practise this" note, swap a screenshot
nextcourse pdf my-course --source deck.print.html   # print the edited copy
```

> `deck.print.html` is generated output: rebuilding `deck.html` with `render` does not update it,
> you have to `--keep` again. So whatever `data-print="off"` can handle, let it handle.

---

##### When learners will print on paper: `--theme print-light`

A dark deck wastes toner and reads badly on paper. One flag gives you a paper-first light version
with **identical layout**:

```bash
nextcourse pdf my-course --theme print-light   # → deck.print-light.pdf
```

`print-light` derives from `warm-sand` and changes four things, all for paper: pure white
background (no ink), no shadows (cards separate on a 1px hairline border), **module dividers left
blank except the title** (type size and weight untouched), and light-on-dark code blocks flipped.
It is kept out of the theme gallery, and it does not belong in `course.meta.md`'s `theme:` —
that would have you presenting a white deck on a projector.

Two limits worth stating up front: printed in black and white, the red/green semantic colours
collapse into similar greys (the slides carry ✓/✗ marks and borders too, so meaning does not rest
on colour alone); and dark screenshots stay dark — that is content, not theme.

---

##### What it actually does (read this before changing how exports look)

1. copies `deck.html`, adds `class="print-pdf"` to `<html>` and injects one `@page` rule that pins
   the paper size; drops opted-out pages and swaps the `color-schemes/*.css` line if asked;
2. the "导出 PDF" section of `shared_styles/base_layout.css` takes over and flattens the
   presenter — which shows one slide at a time — into a scroll of pages. No node moves,
   so every `.slides > section …` selector in the design system still matches: what you see
   on screen is what lands on the page;
3. headless Chrome prints it, then the temporary copy is deleted (unless `--keep`).
   `deck.html` is never touched.

> This is deliberately not reveal's own `?print-pdf`. That path moves every section into a
> `.pdf-page` wrapper, which un-matches the canvas, the component spacing and the module
> divider colours all at once.

**Self-check:** the command reports page count and paper size. More pages than expected means a
slide overflowed the frame and got split — run `nextcourse shot <name> --check` to find it.

**Examples:**

```bash
# default output at courses/python-basics/pdf/deck.pdf
npm run pdf python-basics

# explicit path and filename
nextcourse pdf python-basics pdf/python-basics-slides.pdf

# printable version for learners, at 4:3
nextcourse pdf python-basics --theme print-light --size 1600x1200
```

---

#### `shot` — overflow detection + per-page screenshots

```bash
npm run shot <course-name> [--check]
```

Screenshots every slide into `.review/` using a local Chrome:

- detects content overflowing the frame
- detects layout problems
- leaves a PNG per page to review

**Arguments:**

- `--check` — detect only, write no screenshots

**Output:** `courses/<course-name>/.review/`

**Examples:**

```bash
# screenshot every slide
npm run shot python-basics

# detect only (through npm, a leading-dash argument needs -- to be forwarded)
npm run shot python-basics -- --check
# or straight to the CLI, where -- is unnecessary
nextcourse shot python-basics --check
```

---

#### `themes` — build the palette / typeface gallery

```bash
npm run themes
```

Renders the 8 palettes × 8 font sets into a visual gallery at
`theme-gallery/index.html`: one page per palette, with semantic colours, module cover
colours, typefaces, live components and an automatic health check laid out together.
Start here when deciding how a course should look, instead of reading token values out
of CSS files.

Takes no course name — it describes the design system itself.

---

## A full walkthrough

### Building a course from scratch

```bash
# 1. scaffold (add --scale M for in-house training)
npm run new my-course

# 2. design the outline (in Claude Code)
#    run: nextcourse-design

# 2b. M/L: evaluation plan and content development (in Claude Code)
#    run: nextcourse-delivery my-course

# 2c. M/L: teaching-design closure check
npm run check my-course

# 3. generate slides (in Claude Code)
#    run: nextcourse-slides my-course

# 4. lint + build
npm run render my-course

# 5. look at it
open courses/my-course/deck.html

# 6. iterate
#    edit slides/slide-XX.html
#    run again: npm run render my-course

# 7. visual check (needs Chrome)
npm run shot my-course

# 8. trainer handout
npm run notes my-course

# 8b. M/L: build the delivery package
nextcourse package my-course --render

# 9. package for delivery (add --with-package at M/L)
npm run export my-course
# or to a chosen location:
npm run export my-course ~/Desktop/delivery
```

---

## Common situations

### 1 · I edited a slide and want to see it

```bash
npm run render <course-name>
open courses/<course-name>/deck.html
```

### 2 · I only want the checks, no screenshots

```bash
npm run shot <course-name> -- --check
```

### 3 · Editing round after round

```bash
npm run render my-course
open courses/my-course/deck.html
# ... edit ...
npm run render my-course   # again
```

### 4 · Pre-delivery checklist

```bash
# 1. every rule passes
npm run render my-course

# 2. visual check
npm run shot my-course

# 3. review the speaker notes
npm run notes my-course
cat courses/my-course/handout.md

# 4. build the delivery package
npm run export my-course
```

---

## Cheat sheet

| Command | Purpose | When |
|---|---|---|
| `list` | list every course | starting a session |
| `new <name>` | scaffold a course | starting a course |
| `compose <name>` | preview candidates/rebuild from an exact lock | when a course reuses shared units |
| `validate <name>` | validate a composed course without writes | before builds or updates |
| `trace <name> <id>` | inspect complete provenance | when locating a page or instance source |
| `impact <source-id>` | find direct/transitive consumers | before changing shared source |
| `sync <name>` | preview/apply an upstream update | when a new version is available |
| `lint <name>` | check the rules | after editing |
| `build <name>` | produce deck.html | internal — use `render` |
| `render <name>` | lint + build | ⭐ **most used**, after every edit |
| `export <name>` | delivery package | when the course is done |
| `notes <name>` | trainer handout | collecting speaker notes |
| `shot <name>` | screenshot review | before delivery |
| `animate <name>` | apply / strip entrance animations | once content is settled |
| `themes` | palette / typeface gallery | when choosing the look |

---

## Tips

### 1 · Working alongside the browser

```bash
npm run render my-course
# then go back to the browser and hit F5 / Cmd-R on the open deck.html
```

> There is no hot reload. `deck.html` is a static file — `render` rewrites it, but the
> browser has no way to know. Refreshing returns Reveal to slide 1; put `#/12` in the
> URL to land back on a given slide.

### 2 · A fast edit loop

Open `slides/` in your editor and `deck.html` in a browser side by side, re-running
`render` after each edit.

### 3 · Several courses at once

```bash
npm run list
npm run render course1
npm run render course2
```

### 4 · One line before exporting

```bash
npm run render my-course && npm run shot my-course && npm run export my-course
```

---

## Where your courses live

Courses land under **the directory you run the command from**: `./courses/<name>/`.
So `cd` to wherever you keep them before you start.

| Variable | Effect |
|---|---|
| `NEXTCOURSE_HOME` | Pin the working directory. Courses always go to `$NEXTCOURSE_HOME/courses/`, wherever you invoke from |
| `CHROME_PATH` | Browser used by `shot` (Chrome / Chromium is auto-detected otherwise) |

The engine's own `lib/`, `shared_styles/` and `templates/` are always read from where
the package is installed, independent of your working directory. `nextcourse doctor`
prints both roots — **"where did my course go" is almost always the wrong directory**.

Run from inside a clone of the repo and the working directory *is* the repo root, so
`courses/<name>/` resolves exactly as it did before v4.

```bash
nextcourse doctor
# NextCourse doctor — v4.0.0
# ✓  Node 20.11.0
# ✓  引擎位置   /usr/local/lib/node_modules/nextcourse    ← engine
# ✓  工作目录   /Users/you/my-courses  (当前目录)          ← working directory
# ✓  课程目录   /Users/you/my-courses/courses             ← courses
# ✓  Chrome     /Applications/Google Chrome.app/Contents/MacOS/Google Chrome
# ✓  引擎资产   完整                                       ← engine assets OK
```

> The CLI's own output is Chinese — it has not been internationalised. The two lines
> that matter are 引擎位置 (where the engine is) and 工作目录 (where your courses go).

---

## `nextcourse docs <name>` — print the bundled documentation

This is how the skills read the design system without copying tens of thousands of
words into a prompt.

| Name | Contents |
|---|---|
| `design-system` | Full reference for all 24 components — required reading before writing slides |
| `agent` | Directory layout, workflows, hard rules |
| `cli` | This manual |
| `domains` | Subject-domain fit: which activities and components suit which topic |

```bash
nextcourse docs                    # list what's available
nextcourse docs design-system      # print to stdout
nextcourse docs domains | head -40
```

---

## Requirements

- **Node.js** 20 or newer
- **Zero npm dependencies** — the CLI uses only Node built-ins (`fs`, `path`,
  `child_process`, `https`), so there is nothing else to install. The `npm run *`
  scripts are just shortcuts for `nextcourse *` when working from a clone.
- **Chrome / Chromium / Edge** — only for `shot`. Point `CHROME_PATH` at a custom
  binary if it is not in a standard location.

Install:

```bash
npm i -g nextcourse                    # or use npx -y nextcourse <command>
npx skills add skill-node/nextcourse   # the four Agent Skills
```

---

## More

The project's design and workflow are documented in [AGENT.md](./AGENT.md)
(Chinese only).
