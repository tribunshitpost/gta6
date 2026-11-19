# Neon Bay — an open-world crime game

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/tribunshitpost/gta6/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/tribunshitpost/gta6/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Neon Bay** is a complete 3D open-world crime game that runs entirely in a
desktop browser from static files — no network, no build step, no server
beyond any plain static file host. It was built from scratch for the
make.fun gta6-01 bounty ("Make GTA 6") with three.js r160 vendored locally.

## The city

Neon Bay is a sun-soaked harbour city of five districts, each with its own
look: **Lumen Square** (the neon plaza and fountain), **Vesper Quay** (the
docks and warehouses), **Coral Row** (bars, motels and bright signs),
**Palmetto Heights** (palm-lined residential streets) and the **Foundry
District** (factories, cranes and the car fence). Traffic loops the avenues,
pedestrians crowd the sidewalks, and the bay glitters to the east at dusk.

## What you can do

- **Explore on foot and by car** — walk the streets, steal any parked car
  with `E`, drive with `W A S D`, handbrake with `Space`.
- **Three story missions** — *First Light* (a pickup and delivery run),
  *Hot Pursuit* (a police escape across the city) and *Dockside Debt* (a
  collection at the docks). Start one with `1`, `2` or `3`.
- **A 0–5 star wanted system** — crimes raise your heat, police cruisers
  chase, ram and try to bust you. Lay low and the heat cools off.
- **Combat** — aim with the mouse, fire your pistol with click / `F`.
  Shooting, stealing and hitting pedestrians all raise your wanted level.
- **Money** — earn cash from missions, fence stolen cars at the Foundry lot
  (`F` while parked in the yellow zone), grab cash and health pickups.
- **Save and continue** — versioned `localStorage` saves with autosave;
  your cash, health, missions and best wanted level persist.

## Controls

| Key | Action |
| --- | --- |
| `W A S D` | Move / drive |
| Mouse drag | Orbit the camera |
| `E` | Enter / exit a car |
| `F` | Shoot (on foot) / sell car at the fence (in car) |
| `Space` | Jump (on foot) / handbrake (in car) |
| `Shift` | Sprint |
| `1 / 2 / 3` | Start mission 1 / 2 / 3 |
| `M` | Toggle music |
| `P` / `Esc` | Pause |
| `H` | Toggle HUD help |

Add `?lowfx=1` to the URL for a low-effects mode (fewer cars and
pedestrians, no shadows) on slower machines.

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

Or serve `game/` with any static file server and open `index.html`.

## Screenshots

The four screenshots in `screenshots/` are real renders of this game,
captured headlessly from the running build (`shots.json` lists the scene
each one uses: title screen, driving, a mission chase, and the city).

## License

MIT — see `LICENSE`.
