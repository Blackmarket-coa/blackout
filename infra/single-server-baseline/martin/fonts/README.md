# Map label fonts

Martin turns these files into the glyphs the coalition map draws its labels
with (`/tiles/font/<names>/<range>`). The client's map style
(`apps/blackout-client/src/app/features/coalition/tabs/basemapStyle.ts`,
`BASEMAP_FONTS`) asks for them by the names Martin gives them, family then
style:

| File                             | Name Martin serves             |
| -------------------------------- | ------------------------------ |
| `NotoSans-Regular.ttf`           | `Noto Sans Regular`            |
| `NotoSans-Bold.ttf`              | `Noto Sans Bold`               |
| `NotoSans-Italic.ttf`            | `Noto Sans Italic`             |
| `NotoSansDevanagari-Regular.ttf` | `Noto Sans Devanagari Regular` |

## Why they are in the repository

Martin 0.14.2 (the version `docker-compose.yml` pins) will not start when a
fonts directory it is given holds no font, and nginx resolves `martin` when it
starts or reloads. Fetching the fonts as a setup step would leave a deployment
that has not run it with a tile server that does not start. Checked in, they
are there from the first `docker compose up`. The stack runs from a copy of
this folder, so the copy needs them too: `martin/check-fonts.sh <dir>` checks
that the fonts are there and mounted, and `deploy.sh` runs it before
recreating Martin.

## Where they come from

The Ubuntu 24.04 package `fonts-noto-core` 20201225-2
(`apt-get download fonts-noto-core`, SHA-256
`4fee136cb12fc197703a340e010478f780a41044339fcefbd78ed9aa96c8b617`), files
from `/usr/share/fonts/truetype/noto/`, unchanged:

```
89c3c497f618fdaa0b2d1e98fef93582f28c71debd2c4a8cdf41f190ced2909d  NotoSans-Regular.ttf
e83493c945848ecd4a9ad0f6d19164541a0d3e23a9c952304a00a46e00272ac5  NotoSans-Bold.ttf
5d7618dda819443fd07301c84adcee9fe8960c873ea5e5e1f0f59db384b78082  NotoSans-Italic.ttf
79a470365ccb210fa3c7d8d8ff2e005ef9d983cfd067f735a0caf7e15070ca9f  NotoSansDevanagari-Regular.ttf
```

They are under the SIL Open Font License 1.1 (`OFL.txt`), which allows them to
be redistributed with software. Replacing one is fine as long as the new file
gives Martin the same name; `docker compose exec martin wget -qO-
http://127.0.0.1:3000/catalog` lists the names it serves.

A label in a script these fonts do not cover (Chinese, Arabic, ...) is drawn
without those characters: Martin answers an empty glyph range for them.
