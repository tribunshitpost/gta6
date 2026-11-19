// Neon Bay — screenshot scenes (?shot=...).
// Each shot is a fixed, readable moment of the game, used for the four
// screenshots in screenshots/. The game still runs live in the scene —
// traffic moves, the camera orbits — so the shot is a real render, not a
// staged picture. `applyShot` runs after the world is built and returns
// the camera framing the scene wants.
export function parseShot() {
  const params = new URLSearchParams(window.location.search);
  return {
    shot: params.get('shot') || '',
    seed: Number(params.get('seed') || '7'),
    lowFx: params.get('lowfx') === '1',
  };
}

// Drive the game into the named scene. `game` is the object main.js
// exposes (player, car, missions, police, camera rig, ...).
export function applyShot(game, shot) {
  if (!shot) return null;
  if (shot === 'start') {
    // Title screen over the plaza at dusk: stay on the start screen.
    game.cameraMode = 'orbit';
    game.orbitTarget = { x: 0, z: 0 };
    game.orbitRadius = 55;
    game.orbitHeight = 26;
    return { keepTitle: true };
  }
  if (shot === 'drive') {
    // The player is already in a parked car, rolling down an avenue.
    game.startPlaying();
    const car = game.parked.nearest(0, 0, 500);
    if (car) game.enterCar(car);
    game.playerCar.speed = 18;
    game.playerCar.heading = Math.PI / 2;
    game.cameraMode = 'chase';
    return { keepTitle: false };
  }
  if (shot === 'mission') {
    // Mid-chase: mission 2 running, two stars of heat, cruisers closing.
    game.startPlaying();
    game.missions.start(1, game.state.missionsDone);
    // (Mission 2 already adds its own 2 stars of heat when it starts.)
    const car = game.parked.nearest(0, 0, 500);
    if (car) game.enterCar(car);
    game.playerCar.speed = 24;
    game.cameraMode = 'chase';
    return { keepTitle: false };
  }
  if (shot === 'city') {
    // High wide view over Lumen Square: plaza, towers, neon, docks.
    game.startPlaying();
    game.cameraMode = 'orbit';
    game.orbitTarget = { x: 10, z: -10 };
    game.orbitRadius = 110;
    game.orbitHeight = 70;
    return { keepTitle: false };
  }
  return null;
}
