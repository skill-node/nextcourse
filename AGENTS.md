# AGENTS.md

Entry point for agents. This file is a signpost, not the documentation — everything
below links to the real thing.

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
`.claude/skills/` — copy them to wherever your runtime keeps skills. Per-runtime
target paths are in [`.claude/skills/README.md`](./.claude/skills/README.md), also
summarised in the README install section.

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
| [`AGENT.md`](./AGENT.md) | Full project reference — architecture, file map, workflows (**Chinese**) |
| [`DESIGN-SYSTEM.md`](./DESIGN-SYSTEM.md) | The 24 slide components; required reading before authoring slides (**Chinese**) |
| [`CLI_MANUAL.md`](./CLI_MANUAL.md) · [`.en.md`](./CLI_MANUAL.en.md) | Every command and flag |
| [`README.md`](./README.md) · [`.zh-CN.md`](./README.zh-CN.md) | What this is and why, for humans |

Also reachable without cloning: `nextcourse docs agent | design-system | cli | domains`.

Things that are easy to get wrong here:

- `.claude/skills/` is the **single source** for the four skills. Do not keep copies
  under `.agents/skills/` or anywhere else — a copy drifts silently.
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
