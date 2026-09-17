# AGENTS.md — NextCourse Codex 入口

Entry point for Codex. This file is a signpost, not the documentation — everything
below links to the real thing. Codex-specific project skills are exposed through
`.agents/skills/` symbolic links; their canonical source remains `.claude/skills/`.

**NextCourse** is a course-development toolchain: four [Agent
Skills](https://code.claude.com/docs/en/skills) that design a course through
conversation, plus a zero-dependency Node CLI that builds the deck and the delivery
pack. Skills are prompts, the CLI does the work — **both halves are required**.

## If you were asked to install this

```bash
npx skills add skill-node/nextcourse     # the four skills
npm i -g nextcourse                      # the engine
nextcourse doctor                        # verify, and see where courses will land
```

No `skills add` command in this runtime? The skills are plain directories under
`.claude/skills/`. For Codex, use the tracked `.agents/skills/` links already present;
other runtimes should follow the target paths in
[`.claude/skills/README.md`](./.claude/skills/README.md), also summarised in the README
install section.

Courses are written to **the directory the agent is running in** — `./courses/<name>/`
— not next to the installed package. `NEXTCOURSE_HOME` pins them elsewhere. Requires
Node 20+; the screenshot pass also needs a local Chrome / Chromium / Edge.

## If you are using it

Just talk. `nextcourse` is the control desk — it works out which stage the user is
stuck at and routes to `nextcourse-design`, `nextcourse-slides` or
`nextcourse-delivery`. Each of those three also triggers directly when the user names
its stage, so a single-stage request need not go through the control desk.

## If you are working in this repository

| Read | For |
|---|---|
| [`resource/development/README.md`](./resource/development/README.md) → [`FOLLOWUP.md`](./resource/development/FOLLOWUP.md) | Repository development handoff, current plans and project-wide followups (**local workspace only**) |
| [`AGENT.md`](./AGENT.md) | Full project reference — architecture, file map, workflows (**Chinese**) |
| [`DESIGN-SYSTEM.md`](./DESIGN-SYSTEM.md) | The 24 slide components; required reading before authoring slides (**Chinese**) |
| [`CLI_MANUAL.md`](./CLI_MANUAL.md) · [`.en.md`](./CLI_MANUAL.en.md) | Every command and flag |
| [`README.md`](./README.md) · [`.zh-CN.md`](./README.zh-CN.md) | What this is and why, for humans |

Also reachable without cloning: `nextcourse docs agent | design-system | cli | domains`.

For repository development, read the development entry and FOLLOWUP first; update
FOLLOWUP with progress, verification and the next action before handing off. Keep
development plans and future project followups under `resource/development/`, not
`courses/`. These local documents are Git-ignored and not shipped with npm; if they
are missing, report that context gap rather than treating historical plans as current.

Things that are easy to get wrong here:

- `.claude/skills/` is the **single source** for the four skills. `.agents/skills/`
  contains symbolic links for Codex, not copies; do not replace them with copies.
- `deck.html` and `slides/*.html` under a course are **generated**. Edit
  `course.meta.md` or the slide sources and rebuild; never hand-edit the output.
- In a delivery pack, the Markdown is the source and the HTML is the artifact.
  Change the `.md`, re-run `nextcourse package <name> --render`.
- The prompts and the reference docs are written in Chinese, but **the conversation
  and the output follow the user's language**. Field names, CSS classes and component
  names stay English regardless.

MIT licensed. Vendored Reveal.js, webfonts and Font Awesome carry their own licences —
see [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md) before touching `lib/` or
`export.js`.
