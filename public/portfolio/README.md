# Portfolio (munzir)

Standalone static portfolio, served at `/portfolio` and `/munzir`.
It lives in `public/` so Vite copies it into `dist/` untouched. It shares
nothing with the SUNSEX app in `src/`: no React, no build step of its own.

## Edit content

1. Change `data/projects.js` (all copy, clients, case studies, media lists).
2. From this folder run `node build.js`. It rewrites the generated sections of
   `index.html`. Don't hand-edit between the `<!-- X:START -->` / `<!-- X:END -->` markers.
3. Preview: `npm run dev` from the repo root, then open http://localhost:5173/portfolio/

## Media

- Put files in `media/`. Use H.264 `.mp4` for video (HEVC/.mov won't play in every browser).
- Each video needs a poster frame in `media/posters/` with the same name and `.jpg`.
  Make one with: `ffmpeg -ss 1 -i media/clip.mp4 -frames:v 1 -vf scale=480:-2 media/posters/clip.jpg`
- The first item in a case study's `media` list is what shows on the big screen first.

## Routing

`vercel.json` at the repo root rewrites `/portfolio` and `/munzir` to
`/portfolio/index.html`, ahead of the app's catch-all rewrite.

Copy rule: no em dashes anywhere on the site.
