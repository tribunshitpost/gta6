# Neon Bay — Open-World Crime Game

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![make.fun rank](https://make.fun/badge/rank/gta6.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![make.fun reward](https://make.fun/badge/reward/gta6.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Neon Bay** is a complete open-world crime game that runs offline in a desktop
browser. You are **Rook**, a driver fresh off the bus in Neon Bay — a sun-soaked
bay city of neon signs, beachfronts, dockyards and grid streets. Marla Voss runs
the city's quiet jobs, and she needs a driver she can trust. Steal cars, outrun
the police, run her missions, and make the city yours.

Everything in the game is original: the city, characters, vehicles, story, art
and sound were made for this entry. No assets, names, maps or characters from
any commercial game are used.

## How to play

Serve the game locally and open it in a desktop browser (Chrome recommended):

```bash
node serve.ts
# open http://localhost:8080
```

No build step, no network requests — every file the game loads lives under
`game/`, including the vendored three.js build (`game/vendor/three.module.min.js`).
The game also works from any static file server pointed at `game/`.

Follow the gold beacon to **Marla's office** and press **E** to start a mission.
Between missions, explore freely: steal cars, collect the green cash bundles
hidden around the city ($25 each), and stay out of trouble — or don't.

## Controls

| Input | Action |
|---|---|
| W A S D / arrows | Move on foot / drive |
| Mouse (click to lock) | Look around |
| E | Enter / exit a car, steal a car, talk to Marla |
| Left click | Shoot pistol (aim with the crosshair) |
| F | Punch |
| R | Reload |
| Shift | Sprint |
| C | Switch camera (near / far / top) |
| P / Esc | Pause |
| H | Help |
| M | Mute sound |

## Systems

- **Open-world city** — a 3D grid city built with three.js: ~70 buildings with
  lit windows, neon signs, a beach and bay with a wooden pier, a central plaza
  with a fountain, palm trees, street lamps and a dockyard full of crates.
- **On foot + driving** — third-person walking with sprint and a chase camera
  for cars; arcade driving physics with acceleration, braking, reverse and
  steering that only bites once the car is moving.
- **Traffic & pedestrians** — traffic cars loop around city blocks and stop for
  the car ahead; pedestrians stroll the sidewalks and panic and flee when
  scared (gunshots, a stolen car, a wanted player nearby).
- **Stealing cars** — walk up to any traffic car and press E. Stealing raises
  your wanted level by one star; the car is yours until you park it (press E
  again to step out — it stays where you left it).
- **Wanted system & police** — 0–5 stars. Police cars spawn and ram you while
  driving; foot cops chase you on foot and bust you if they hold you for
  ~1.5 seconds. Stay quiet and unseen for 22 seconds and a star drops.
  Getting busted costs $120, getting wasted costs $150.
- **Missions & story** — three story missions for Marla Voss: *Borrowed Wheels*
  (steal a car, deliver it to the paint shop), *The Bayfront Drop* (grab a
  package at Pier 9, deliver it to the Sunset Club while the police chase you),
  and *Dockyard Debt* (settle things with the Kestrel crew at the docks). Each
  pays out ($150 / $300 / $500) and advances the story; finishing all three
  opens free roam.
- **Combat** — pistol with tracers, muzzle flash and limited ammo (12-round
  magazine, 48 in reserve; R reloads), plus melee punches. The Kestrel crew
  shoots back during the final mission, with hit chance falling off with range.
- **HUD & minimap** — health bar (green / amber / red), money, wanted stars,
  mission objective with distance, speedometer, ammo counter, crosshair, and a
  live circular minimap showing roads, traffic, police, enemies, uncollected
  cash and the objective beacon.
- **Start screen & save** — title screen with story and controls, pause menu,
  help screen, and progress saved to localStorage (money, health, mission
  progress, cash collected, position). Auto-saves after every mission; health
  slowly regenerates when the player is calm and unhurt.
- **Polish** — golden-hour lighting with haze, day sky, synthesized WebAudio
  sound (engine hum that follows speed, two-tone police sirens, gunshots,
  pickups, and a synth-wave music loop — no audio files), damage flash,
  mission banners and toasts.

## Project layout

```
main.ts                  entry program: copies game/ + screenshots/ to /output, writes dossier.json
serve.ts                 tiny static server for local play (node serve.ts [--port N])
shots.json               the four screenshot scenes (name + ?shot= query each)
game/
  index.html             page shell, HUD DOM, import map for three.js
  vendor/
    three.module.min.js  vendored three.js r160 (MIT)
  src/
    main.js              game loop, player, camera, interactions, state machine
    config.js            tuning constants, missions, cash spots, places
    city.js              city geometry, neon signs, beach, collision boxes
    vehicles.js          car meshes, driving physics, traffic AI
    pedestrians.js       pedestrian AI + low-poly person builder
    police.js            wanted system, police cars, foot cops
    combat.js            pistol, melee, enemy gang members, tracers
    missions.js          mission runner, objective beacon, cash pickups
    hud.js               HUD DOM, minimap canvas, menus
    audio.js             synthesized WebAudio sound + music
    input.js             keyboard / mouse / pointer lock
    save.js              localStorage save / load
    util.js              seeded RNG, math, collision helpers
    shots.js             deterministic screenshot scenes (?shot=...)
screenshots/             real renders of the game (see shots.json)
vendor/
  makefun-game.ts        make.fun dossier library (kit copy, unchanged)
```

## Screenshots

The four screenshots are real renders of the game, captured headlessly with
Playwright Chromium from the `?shot=` scenes in `game/src/shots.js`:

1. `1-start.jpg` — title screen over the city
2. `2-drive.jpg` — stolen car, 3 wanted stars, police in pursuit
3. `3-mission.jpg` — the dockyard showdown (final mission)
4. `4-city.jpg` — high view over Neon Plaza

## License

MIT — see [LICENSE](LICENSE). three.js is vendored under its own MIT license.

---

Built for the [make.fun gta6-01 bounty](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) — play it, steal it, outrun it. Referral: https://make.fun/r/24pn59hn
