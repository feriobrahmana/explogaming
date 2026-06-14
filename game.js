const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const p1Health = document.getElementById("p1Health");
const p2Health = document.getElementById("p2Health");
const timerEl = document.getElementById("timer");
const roundLabel = document.getElementById("roundLabel");
const resetButton = document.getElementById("resetButton");

const keys = new Set();
const W = canvas.width;
const H = canvas.height;
const floorY = 438;
const gravity = 0.72;
const friction = 0.82;

let lastTime = performance.now();
let round = 1;
let roundTime = 90;
let message = "";
let messageUntil = 0;
let matchOver = false;
let roundLocked = false;

const fighters = [
  makeFighter({
    id: 1,
    label: "Red Panda",
    x: 255,
    facing: 1,
    fill: "#d85c43",
    belly: "#fff0df",
    dark: "#392521",
    controls: {
      left: "KeyA",
      right: "KeyD",
      jump: "KeyW",
      down: "KeyS",
      jab: "KeyF",
      kick: "KeyG"
    }
  }),
  makeFighter({
    id: 2,
    label: "River Otter",
    x: 705,
    facing: -1,
    fill: "#5f7f72",
    belly: "#efe4cd",
    dark: "#1f2d2a",
    controls: {
      left: "ArrowLeft",
      right: "ArrowRight",
      jump: "ArrowUp",
      down: "ArrowDown",
      jab: "KeyK",
      kick: "KeyL"
    }
  })
];

function makeFighter(config) {
  return {
    ...config,
    y: floorY,
    vx: 0,
    vy: 0,
    w: 58,
    h: 112,
    health: 100,
    stocks: 2,
    grounded: true,
    crouching: false,
    attacking: null,
    attackFrame: 0,
    hitstun: 0,
    invincible: 0,
    state: "idle",
    comboGlow: 0,
    lastAttack: 0
  };
}

function resetRound(keepScores = true) {
  fighters[0].x = 255;
  fighters[1].x = 705;
  fighters.forEach((fighter, index) => {
    fighter.y = floorY;
    fighter.vx = 0;
    fighter.vy = 0;
    fighter.facing = index === 0 ? 1 : -1;
    fighter.health = 100;
    fighter.grounded = true;
    fighter.crouching = false;
    fighter.attacking = null;
    fighter.attackFrame = 0;
    fighter.hitstun = 0;
    fighter.invincible = 55;
    fighter.state = "idle";
    fighter.comboGlow = 0;
  });
  if (!keepScores) {
    round = 1;
    fighters.forEach((fighter) => {
      fighter.stocks = 2;
    });
    matchOver = false;
  }
  roundLocked = false;
  roundTime = 90;
  message = `Round ${round}`;
  messageUntil = performance.now() + 1200;
  updateHud();
}

function pressAttack(fighter, type) {
  if (fighter.attacking || fighter.hitstun > 0 || matchOver) return;
  fighter.attacking = type;
  fighter.attackFrame = 0;
  fighter.lastAttack = performance.now();
  fighter.state = type;
}

function updateFighter(fighter, opponent) {
  const c = fighter.controls;
  const left = keys.has(c.left);
  const right = keys.has(c.right);
  fighter.crouching = keys.has(c.down) && fighter.grounded && !fighter.attacking;

  if (fighter.hitstun > 0) {
    fighter.hitstun -= 1;
  } else if (!fighter.attacking) {
    if (left) fighter.vx -= fighter.grounded ? 0.82 : 0.38;
    if (right) fighter.vx += fighter.grounded ? 0.82 : 0.38;
    if (keys.has(c.jump) && fighter.grounded && !fighter.crouching) {
      fighter.vy = -15.5;
      fighter.grounded = false;
    }
  }

  if (fighter.attacking) {
    fighter.attackFrame += 1;
    const total = fighter.attacking === "jab" ? 18 : 28;
    if (fighter.attackFrame > total) {
      fighter.attacking = null;
      fighter.attackFrame = 0;
    }
  }

  fighter.vy += gravity;
  fighter.x += fighter.vx;
  fighter.y += fighter.vy;
  fighter.vx *= fighter.grounded ? friction : 0.96;

  if (fighter.y >= floorY) {
    fighter.y = floorY;
    fighter.vy = 0;
    fighter.grounded = true;
  }

  fighter.x = Math.max(52, Math.min(W - 52, fighter.x));
  fighter.facing = opponent.x >= fighter.x ? 1 : -1;
  fighter.invincible = Math.max(0, fighter.invincible - 1);
  fighter.comboGlow = Math.max(0, fighter.comboGlow - 1);

  if (fighter.hitstun > 0) fighter.state = "hit";
  else if (fighter.attacking) fighter.state = fighter.attacking;
  else if (!fighter.grounded) fighter.state = "jump";
  else if (fighter.crouching) fighter.state = "crouch";
  else if (Math.abs(fighter.vx) > 0.9) fighter.state = "run";
  else fighter.state = "idle";
}

function getHurtBox(fighter) {
  const height = fighter.crouching ? 74 : fighter.h;
  return {
    x: fighter.x - fighter.w / 2,
    y: fighter.y - height,
    w: fighter.w,
    h: height
  };
}

function getAttackBox(fighter) {
  if (!fighter.attacking) return null;
  const activeStart = fighter.attacking === "jab" ? 5 : 9;
  const activeEnd = fighter.attacking === "jab" ? 11 : 17;
  if (fighter.attackFrame < activeStart || fighter.attackFrame > activeEnd) return null;
  const reach = fighter.attacking === "jab" ? 54 : 74;
  const height = fighter.attacking === "jab" ? 34 : 42;
  return {
    x: fighter.x + fighter.facing * 25 + (fighter.facing === 1 ? 0 : -reach),
    y: fighter.y - (fighter.attacking === "jab" ? 85 : 58),
    w: reach,
    h: height,
    damage: fighter.attacking === "jab" ? 7 : 13,
    knock: fighter.attacking === "jab" ? 7.5 : 12,
    lift: fighter.attacking === "jab" ? -3.5 : -7
  };
}

function intersects(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function resolveHits(attacker, defender) {
  const attackBox = getAttackBox(attacker);
  if (!attackBox || defender.invincible > 0 || defender.hitstun > 0) return;
  if (!intersects(attackBox, getHurtBox(defender))) return;

  defender.health = Math.max(0, defender.health - attackBox.damage);
  defender.vx = attacker.facing * attackBox.knock;
  defender.vy = attackBox.lift;
  defender.grounded = false;
  defender.hitstun = attacker.attacking === "jab" ? 13 : 22;
  defender.invincible = 8;
  defender.comboGlow = 18;
  attacker.comboGlow = 10;

  if (defender.health <= 0) {
    scoreRound(attacker, defender);
  }
}

function scoreRound(winner, loser) {
  if (matchOver || roundLocked) return;
  roundLocked = true;
  loser.stocks -= 1;
  if (loser.stocks <= 0) {
    message = `${winner.label} wins`;
    matchOver = true;
  } else {
    round += 1;
    message = `${winner.label} takes it`;
    messageUntil = performance.now() + 1200;
    setTimeout(() => resetRound(true), 900);
  }
  updateHud();
}

function tick(dt) {
  if (!matchOver && !roundLocked) {
    roundTime = Math.max(0, roundTime - dt / 1000);
    if (roundTime <= 0) {
      const winner = fighters[0].health === fighters[1].health ? null : fighters[0].health > fighters[1].health ? fighters[0] : fighters[1];
      if (winner) scoreRound(winner, winner === fighters[0] ? fighters[1] : fighters[0]);
      else {
        message = "Draw";
        roundLocked = true;
        messageUntil = performance.now() + 1200;
        setTimeout(() => resetRound(true), 900);
      }
    }

    updateFighter(fighters[0], fighters[1]);
    updateFighter(fighters[1], fighters[0]);
    resolveHits(fighters[0], fighters[1]);
    resolveHits(fighters[1], fighters[0]);
  }
  updateHud();
}

function updateHud() {
  p1Health.style.transform = `scaleX(${fighters[0].health / 100})`;
  p2Health.style.transform = `scaleX(${fighters[1].health / 100})`;
  timerEl.textContent = String(Math.ceil(roundTime));
  roundLabel.textContent = `Round ${round}`;
}

function drawScene(time) {
  ctx.clearRect(0, 0, W, H);
  drawBackground(time);
  drawFighter(fighters[0], time);
  drawFighter(fighters[1], time);
  drawForeground();

  if (message && (matchOver || roundLocked || performance.now() < messageUntil)) {
    drawMessage(message, matchOver ? "Press Restart" : "");
  }
}

function drawBackground(time) {
  ctx.fillStyle = "#dfe3dd";
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#cfd6d0";
  for (let i = 0; i < 9; i += 1) {
    const x = 55 + i * 112;
    const y = 116 + Math.sin(time / 850 + i) * 5;
    ctx.fillRect(x, y, 54, 12);
  }

  ctx.fillStyle = "#b9c3bb";
  ctx.fillRect(0, floorY + 1, W, H - floorY);
  ctx.fillStyle = "#24272a";
  ctx.fillRect(0, floorY, W, 5);

  ctx.strokeStyle = "#8b958e";
  ctx.lineWidth = 2;
  for (let x = 0; x <= W; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, floorY + 5);
    ctx.lineTo(x + 26, H);
    ctx.stroke();
  }
}

function drawFighter(fighter, time) {
  const bob = Math.sin(time / 120 + fighter.id) * (fighter.state === "idle" ? 2 : 1);
  const run = fighter.state === "run" ? Math.sin(time / 65) : 0;
  const x = fighter.x;
  const y = fighter.y + bob;
  const s = fighter.facing;
  const crouch = fighter.state === "crouch" ? 18 : 0;
  const hitLean = fighter.state === "hit" ? -s * 9 : 0;
  const attackReach = fighter.state === "jab" ? Math.min(1, fighter.attackFrame / 7) : fighter.state === "kick" ? Math.min(1, fighter.attackFrame / 11) : 0;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, 1);
  ctx.rotate((run * 0.04) + (hitLean * 0.006));

  if (fighter.comboGlow > 0) {
    ctx.fillStyle = "rgba(240, 192, 90, 0.25)";
    ctx.beginPath();
    ctx.ellipse(0, -56, 54, 72, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.lineWidth = 10;
  ctx.lineCap = "round";
  ctx.strokeStyle = fighter.dark;

  const legLift = fighter.state === "kick" ? 34 * attackReach : 0;
  ctx.beginPath();
  ctx.moveTo(-16, -18);
  ctx.lineTo(-28 - run * 5, 0);
  ctx.moveTo(16, -18);
  ctx.lineTo(28 + run * 5 + legLift, fighter.state === "kick" ? -45 : 0);
  ctx.stroke();

  ctx.fillStyle = fighter.fill;
  roundedBody(-31, -94 + crouch, 62, 82 - crouch, 24);
  ctx.fillStyle = fighter.belly;
  ctx.beginPath();
  ctx.ellipse(5, -48 + crouch * 0.6, 21, 29 - crouch * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = fighter.dark;
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(-24, -72 + crouch);
  ctx.lineTo(-54 - run * 5, -50 + crouch);
  ctx.moveTo(24, -72 + crouch);
  ctx.lineTo(48 + 42 * attackReach, -70 + (fighter.state === "jab" ? 0 : 22) + crouch);
  ctx.stroke();

  ctx.fillStyle = fighter.fill;
  roundedBody(-34, -138 + crouch, 68, 54, 25);
  ctx.fillStyle = fighter.dark;
  ctx.beginPath();
  ctx.moveTo(-24, -130 + crouch);
  ctx.lineTo(-43, -155 + crouch);
  ctx.lineTo(-9, -142 + crouch);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(24, -130 + crouch);
  ctx.lineTo(43, -155 + crouch);
  ctx.lineTo(9, -142 + crouch);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#101112";
  ctx.beginPath();
  ctx.arc(-13, -118 + crouch, 4, 0, Math.PI * 2);
  ctx.arc(13, -118 + crouch, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = fighter.belly;
  ctx.beginPath();
  ctx.ellipse(0, -104 + crouch, 15, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#101112";
  ctx.beginPath();
  ctx.arc(0, -108 + crouch, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  drawShadow(fighter.x, floorY + 5, fighter.grounded ? 1 : 0.72);
  if (fighter.invincible > 0 && Math.floor(fighter.invincible / 4) % 2 === 0) {
    ctx.strokeStyle = "rgba(255,255,255,0.65)";
    ctx.lineWidth = 3;
    ctx.strokeRect(fighter.x - 38, fighter.y - fighter.h - 32, 76, fighter.h + 32);
  }
}

function roundedBody(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.fill();
}

function drawShadow(x, y, scale) {
  ctx.fillStyle = "rgba(20, 21, 22, 0.18)";
  ctx.beginPath();
  ctx.ellipse(x, y, 48 * scale, 9 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawForeground() {
  fighters.forEach((fighter, index) => {
    ctx.fillStyle = "#24272a";
    ctx.font = "700 16px system-ui, sans-serif";
    ctx.textAlign = index === 0 ? "left" : "right";
    ctx.fillText(`${fighter.stocks} stock${fighter.stocks === 1 ? "" : "s"}`, index === 0 ? 26 : W - 26, 36);
  });
}

function drawMessage(title, subtitle) {
  ctx.fillStyle = "rgba(18, 19, 20, 0.72)";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#f3efe7";
  ctx.textAlign = "center";
  ctx.font = "800 52px system-ui, sans-serif";
  ctx.fillText(title, W / 2, H / 2 - 8);
  if (subtitle) {
    ctx.fillStyle = "#c9c3b7";
    ctx.font = "700 20px system-ui, sans-serif";
    ctx.fillText(subtitle, W / 2, H / 2 + 34);
  }
}

function loop(now) {
  const dt = Math.min(32, now - lastTime);
  lastTime = now;
  tick(dt);
  drawScene(now);
  requestAnimationFrame(loop);
}

window.addEventListener("keydown", (event) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) {
    event.preventDefault();
  }
  if (!keys.has(event.code)) {
    if (event.code === fighters[0].controls.jab) pressAttack(fighters[0], "jab");
    if (event.code === fighters[0].controls.kick) pressAttack(fighters[0], "kick");
    if (event.code === fighters[1].controls.jab) pressAttack(fighters[1], "jab");
    if (event.code === fighters[1].controls.kick) pressAttack(fighters[1], "kick");
  }
  keys.add(event.code);
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

resetButton.addEventListener("click", () => resetRound(false));

resetRound(false);
requestAnimationFrame(loop);
