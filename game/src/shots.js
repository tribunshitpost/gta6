// Deterministic screenshot scenes (?shot=start|drive|mission|city).
// Each scene plays the real game forward from a fixed setup, then sets
// window.__shotReady so the capture script knows the frame is ready.
// Nothing here is fake: the pixels are the live game.
// Revision: longer settle times so the chase camera and the dockyard
// fight are fully framed, and the staged cars sit a touch further apart
// so the pursuit reads clearly at 1280x720.

// How many animation frames to wait before the scene counts as ready.
const READY_FRAMES = {
  start: 50,
  drive: 100,
  mission: 110,
  city: 70,
  default: 50,
};

/** Set window.__shotReady after `frames` animation frames. */
export function armShotReady(frames = 60) {
  let count = 0;
  window.__shotReady = false;
  const tick = () => {
    count += 1;
    if (count >= frames) {
      window.__shotReady = true;
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Stage the 'drive' shot: stolen car at speed, 3 stars, police closing in. */
function stageDrive(game) {
  const car = game.traffic.cars[0];
  game.player.x = car.x + 3;
  game.player.z = car.z + 3;
  game.player.group.position.set(game.player.x, 0, game.player.z);
  game.tryEnterCar();
  game.inCar.heading = Math.PI / 2; // east along Coral Avenue
  game.inCar.speed = 26;
  game.inCar.x = 0;
  game.inCar.z = -40;
  game.inCar.sync();
  game.wanted.addStars(3, 'shot setup');
  // Spawn the pursuit right away instead of waiting for the spawn timer.
  for (let i = 0; i < 3; i++) {
    game.police.spawnTimer = 0;
    game.police.update(0.1, game.wanted, game.inCar.x, game.inCar.z, true, 26, () => {});
  }
  game.camYaw = Math.PI * 1.5;
  game.camPitch = 0.3;
}

/** Stage the 'mission' shot: final mission at the dockyard, crew in sight. */
function stageMission(game) {
  game.missions.missionIndex = 2;
  game.missions.startMission();
  game.player.x = -118;
  game.player.z = 112;
  game.player.heading = 0;
  game.player.group.position.set(game.player.x, 0, game.player.z);
  game.player.group.rotation.y = 0;
  game.wanted.addStars(2, 'shot setup');
  game.camYaw = Math.PI * 0.95;
  game.camPitch = 0.32;
  // Let the first update complete the "goto" step and spawn the enemies.
}

/** Stage the 'city' shot: wide high view over Neon Square. */
function stageCity(game) {
  game.player.x = 20;
  game.player.z = 20;
  game.player.group.position.set(20, 0, 20);
  game.camMode = 0;
  game.camDist = 70;
  game.camYaw = 0.9;
  game.camPitch = 0.5;
}

/** Set up a named screenshot scene on the live game. */
export function stageShot(name, game) {
  if (name === 'start') {
    // Title screen over the orbiting city view (the game stays in the menu).
    armShotReady(READY_FRAMES.start);
    return;
  }
  if (name === 'drive') {
    stageDrive(game);
    armShotReady(READY_FRAMES.drive);
    return;
  }
  if (name === 'mission') {
    stageMission(game);
    armShotReady(READY_FRAMES.mission);
    return;
  }
  if (name === 'city') {
    stageCity(game);
    armShotReady(READY_FRAMES.city);
    return;
  }
  armShotReady(READY_FRAMES.default);
}
