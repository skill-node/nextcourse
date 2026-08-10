# NextCourse CLI Manual

> [中文版 →](./CLI_MANUAL.md) · This is a translation of `CLI_MANUAL.md`; if the two
> ever disagree, the Chinese file is the one kept in step with the code.

## Short answer

**After editing a slide's HTML, the command to rebuild and look at it is:**

```bash
npm run render <course-name>
# or
node nextcourse.js render <course-name>
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
node nextcourse.js new <course-name>
```

Creates:

- `courses/<course-name>/course.meta.md` — outline template
- `courses/<course-name>/slides/` — slide fragments
- `courses/<course-name>/assets/` — images

**Example:**

```bash
npm run new python-basics
```

---

### Development workflow

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

### Delivery workflow

#### `export` — package as an offline-playable folder

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
node nextcourse.js shot python-basics --check
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
# 1. scaffold
npm run new my-course

# 2. design the outline (in Claude Code)
#    run: /course-design

# 3. generate slides (in Claude Code)
#    run: /slide-design my-course

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

# 9. package for delivery
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

## Requirements

- **Node.js** 20.x
- **Zero npm dependencies** — the CLI uses only Node built-ins (`fs`, `path`,
  `child_process`, `https`), so a fresh clone runs without `npm install`. The
  `npm run *` scripts are just shortcuts for `node nextcourse.js *`; npm is optional.
- **Chrome / Chromium / Edge** — only for `shot`. Point `CHROME_PATH` at a custom
  binary if it is not in a standard location.

---

## More

The project's design and workflow are documented in [AGENT.md](./AGENT.md)
(Chinese only).
