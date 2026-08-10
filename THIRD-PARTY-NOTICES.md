# Third-Party Notices

NextCourse itself is MIT-licensed (see [LICENSE](./LICENSE)). It has **zero npm
dependencies** — the CLI runs on Node built-ins alone.

What it *does* bundle is a presentation engine and a set of fonts, vendored into
`lib/` so that an exported course plays on a machine with no network and nothing
installed. Those carry their own licences, listed below. Every licence text is
included in the repository, and `nextcourse export` copies the relevant ones into
each exported course folder — so a deck you hand to a client stays compliant on
its own.

| Component | Version | Licence | Text |
|---|---|---|---|
| [Reveal.js](https://revealjs.com) | 5.2.1 | MIT | [`lib/LICENSE`](./lib/LICENSE) |
| [Font Awesome Free](https://fontawesome.com) | 6.5.1 | Icons CC BY 4.0 · Fonts SIL OFL 1.1 · Code MIT | [`lib/fonts/fontawesome/LICENSE.txt`](./lib/fonts/fontawesome/LICENSE.txt) |
| [Archivo](https://github.com/Omnibus-Type/Archivo) | Google Fonts | SIL OFL 1.1 | [`lib/fonts/display/archivo.LICENSE.txt`](./lib/fonts/display/archivo.LICENSE.txt) |
| [Archivo Black](https://github.com/Omnibus-Type/ArchivoBlack) | Google Fonts | SIL OFL 1.1 | [`lib/fonts/display/archivo-black.LICENSE.txt`](./lib/fonts/display/archivo-black.LICENSE.txt) |
| [Bodoni Moda](https://github.com/indestructible-type/Bodoni) | Google Fonts | SIL OFL 1.1 | [`lib/fonts/display/bodoni-moda.LICENSE.txt`](./lib/fonts/display/bodoni-moda.LICENSE.txt) |
| [Cormorant](https://github.com/CatharsisFonts/Cormorant) | Google Fonts | SIL OFL 1.1 | [`lib/fonts/display/cormorant.LICENSE.txt`](./lib/fonts/display/cormorant.LICENSE.txt) |
| [Noto Sans SC](https://fonts.google.com/noto/specimen/Noto+Sans+SC) | Google Fonts | SIL OFL 1.1 | [`lib/fonts/display/noto-sans-sc.LICENSE.txt`](./lib/fonts/display/noto-sans-sc.LICENSE.txt) |
| [Noto Serif SC](https://fonts.google.com/noto/specimen/Noto+Serif+SC) | Google Fonts | SIL OFL 1.1 | [`lib/fonts/display/noto-serif-sc.LICENSE.txt`](./lib/fonts/display/noto-serif-sc.LICENSE.txt) |
| [Syne](https://gitlab.com/bonjour-monde/fonderie/syne-typeface) | Google Fonts | SIL OFL 1.1 | [`lib/fonts/display/syne.LICENSE.txt`](./lib/fonts/display/syne.LICENSE.txt) |

## Design system

The viewport-fitting layer of `shared_styles/base_layout.css` — the `clamp()`
typography and spacing tokens, the four `@media` breakpoints, the reduced-motion
block, the `html, body` viewport lock and the global `img` constraint — is derived
from **[frontend-slides](https://github.com/zarazhangrui/frontend-slides)** by Zara
Zhang (MIT), with several rules carried over verbatim. Its MIT notice is reproduced at
the top of `base_layout.css` itself, so that it travels with the stylesheet into every
export rather than depending on a separate file being copied.

Five of the eight colour schemes — `bold-signal`, `swiss-modern`, `notebook-tabs`,
`dark-botanical`, `creative-voltage` — take their names and starting point from
frontend-slides presets of the same names. The token values were re-derived for this
project (WCAG contrast floors, split-complementary hue reasoning, module cover colours;
the reasoning is written into each CSS file), so this is acknowledgement rather than a
licence obligation. Credit where it is due either way.

Reveal.js also ships two fonts inside its own bundled themes
(`lib/dist/theme/fonts/`) — League Gothic and Source Sans Pro, both SIL OFL 1.1,
each with its `LICENSE` in place. NextCourse does not use the Reveal themes, but
`lib/dist` is copied wholesale into exports, so those files and their licences
travel together.

The Chinese webfonts are shipped as **unicode-range subsets** (`noto-sans-sc-0NN.woff2`),
generated from the upstream Google Fonts release by `vendor-fonts.js`. OFL 1.1
permits this: subsetting is modification, the result stays under OFL, and the
Reserved Font Names are untouched because the family names are unchanged.

## If you add a font

`vendor-fonts.js` downloads a family from Google Fonts into `lib/fonts/display/`.
Fetch its licence at the same time and save it as `<slug>.LICENSE.txt` next to the
`<slug>.css` — `export.js` looks for exactly that filename and will otherwise ship
your font with no licence attached:

```bash
curl -o lib/fonts/display/<slug>.LICENSE.txt \
  https://raw.githubusercontent.com/google/fonts/main/ofl/<upstream-dir>/OFL.txt
```

Then add a row to the table above.
