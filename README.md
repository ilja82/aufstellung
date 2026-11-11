# Aufstellung

An Angular PWA that builds and saves match lineups (German: *Aufstellung*).
Players tick the positions they can play, and a scheduler generates the lineup.

## Players and positions

Each player has a name and these flags: goalie, striker, likes singles,
likes doubles, plays goalie war. Seats are single, goalie war (`gw`),
goalie and striker. In the settings you choose the doubles mode (four or
five matches), whether the goalie war is included, and which players take part.

## Lineup rules

- Each player plays at most 2 singles and 2 doubles.
- The same doubles pair never plays twice.
- Back-to-back games are avoided (soft rule).
- Seats outside a player's preferred position are a last resort (soft rule).

## Data storage

There is no backend. All data stays in the browser's `localStorage`:

- `players`: the player list
- `current_lineup`: the lineup being edited
- `saved_lineups`: saved lineups
- `lineup_edit_mode`: edit-mode flag

## Commands

- `npm ci`: install the exact dependencies from the lockfile
- `npm start`: run the dev server (`ng serve`)
- `npm test`: run the unit tests (`ng test`, Vitest)
- `npm run build`: build the app into `dist/aufstellung/browser`

## Deploy

`.github/workflows/deploy.yml` deploys to GitHub Pages on every push to
`main` (and on manual dispatch). It runs `npm ci`, builds for production with
`--base-href /<repo-name>/` taken from the repository name, adds `.nojekyll`,
copies `index.html` to `404.html` and publishes the result. The app is a PWA
using the Angular service worker (`ngsw-config.json`).
