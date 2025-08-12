const socket = io();

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const width = canvas.width;
const height = canvas.height;

let players = {};
let bots = {};
let projectiles = {};
let coins = {};
let me = null;
let keys = {};

const scoreboard = document.getElementById('scoreboard');
const mainMenu = document.getElementById('mainMenu');
const startBtn = document.getElementById('startBtn');

let velocity = { x: 0, y: 0 };
const ACCEL = 0.5;
const FRICTION = 0.8;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function drawCircleGradient(x, y, r, color1, color2) {
  let grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
  grad.addColorStop(0, color1);
  grad.addColorStop(1, color2);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawHealthBar(x, y, w, h, health, maxHealth) {
  ctx.fillStyle = '#555';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = health > maxHealth * 0.3 ? '#2ecc71' : '#e74c3c';
  ctx.fillRect(x, y, w * (health / maxHealth), h);
  ctx.strokeStyle = '#000';
  ctx.strokeRect(x, y, w, h);
}

function drawSawBlade(x, y, r, angle) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.strokeStyle = '#ccc';
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    ctx.beginPath();
    ctx.moveTo(r * 0.2, 0);
    ctx.lineTo(r, 0);
    ctx.stroke();
    ctx.rotate(Math.PI / 4);
  }
  ctx.restore();
}

function drawPlayer(player) {
  const shadowOffset = 5;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(player.x + shadowOffset, player.y + shadowOffset, player.size * 1.1, player.size * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();

  drawCircleGradient(player.x, player.y, player.size, player.color1, player.color2);

  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.angle);
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 5;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.moveTo(player.size * 0.7, 0);
  ctx.lineTo(player.size * 0.3, player.size * 0.3);
  ctx.lineTo(player.size * 0.3, -player.size * 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  drawHealthBar(player.x - player.size, player.y + player.size + 8, player.size * 2, 8, player.health, player.maxHealth);
}

function drawBot(bot) {
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(bot.x + 5, bot.y + 5, bot.size * 1.1, bot.size * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();

  drawCircleGradient(bot.x, bot.y, bot.size, bot.color1, bot.color2);
  drawSawBlade(bot.x, bot.y, bot.size, bot.sawAngle);
  drawHealthBar(bot.x - bot.size, bot.y + bot.size + 8, bot.size * 2, 8, bot.health, bot.maxHealth);
}

function drawProjectile(p) {
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
  ctx.fill();
}

function drawCoin(c) {
  const radius = 10;
  const gradient = ctx.createRadialGradient(c.x - radius * 0.3, c.y - radius * 0.3, radius * 0.1, c.x, c.y, radius);
  gradient.addColorStop(0, '#fff973');
  gradient.addColorStop(1, '#f1c40f');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(c.x, c.y, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#b7950b';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(c.x, c.y, radius - 3, 0, Math.PI * 2);
  ctx.stroke();
}

function updateScore() {
  if (me) {
    scoreboard.textContent = `Score: ${me.score}   Coins: ${me.coins || 0}`;
  }
}

function gameLoop() {
  ctx.clearRect(0, 0, width, height);

  // Smooth interpolate players and bots towards server position
  for (const id in players) {
    if (!players[id].renderX) {
      players[id].renderX = players[id].x;
      players[id].renderY = players[id].y;
      players[id].renderAngle = players[id].angle;
    }
    players[id].renderX = lerp(players[id].renderX, players[id].x, 0.15);
    players[id].renderY = lerp(players[id].renderY, players[id].y, 0.15);
    players[id].renderAngle = lerp(players[id].renderAngle, players[id].angle, 0.15);
  }
  for (const id in bots) {
    if (!bots[id].renderX) {
      bots[id].renderX = bots[id].x;
      bots[id].renderY = bots[id].y;
      bots[id].renderSawAngle = bots[id].sawAngle;
    }
    bots[id].renderX = lerp(bots[id].renderX, bots[id].x, 0.1);
    bots[id].renderY = lerp(bots[id].renderY, bots[id].y, 0.1);
    bots[id].renderSawAngle = lerp(bots[id].renderSawAngle, bots[id].sawAngle, 0.2);
  }

  // Smooth projectile movement client-side
  for (const id in projectiles) {
    if (!projectiles[id].renderX) {
      projectiles[id].renderX = projectiles[id].x;
      projectiles[id].renderY = projectiles[id].y;
    }
    projectiles[id].renderX += Math.cos(projectiles[id].angle) * projectiles[id].speed;
    projectiles[id].renderY += Math.sin(projectiles[id].angle) * projectiles[id].speed;
  }

  for (const id in bots) {
    drawBot({
      ...bots[id],
      x: bots[id].renderX,
      y: bots[id].renderY,
      sawAngle: bots[id].renderSawAngle,
    });
  }

  for (const id in players) {
    drawPlayer({
      ...players[id],
      x: players[id].renderX,
      y: players[id].renderY,
      angle: players[id].renderAngle,
    });
  }

  for (const id in projectiles) {
    drawProjectile({
      ...projectiles[id],
      x: projectiles[id].renderX,
      y: projectiles[id].renderY,
    });
  }

  for (const id in coins) {
    drawCoin(coins[id]);
  }

  updateScore();

  requestAnimationFrame(gameLoop);
}

window.addEventListener('keydown', (e) => {
  keys[e.key.toLowerCase()] = true;
});

window.addEventListener('keyup', (e) => {
  keys[e.key.toLowerCase()] = false;
});

function handleMovement() {
  if (!me) return;

  let inputX = 0;
  let inputY = 0;
  if (keys['w'] || keys['arrowup']) inputY -= 1;
  if (keys['s'] || keys['arrowdown']) inputY += 1;
  if (keys['a'] || keys['arrowleft']) inputX -= 1;
  if (keys['d'] || keys['arrowright']) inputX += 1;

  const length = Math.hypot(inputX, inputY);
  if (length > 0) {
    inputX /= length;
    inputY /= length;
  }

  velocity.x += inputX * ACCEL;
  velocity.y += inputY * ACCEL;

  velocity.x *= FRICTION;
  velocity.y *= FRICTION;

  me.x += velocity.x;
  me.y += velocity.y;

  me.x = Math.min(Math.max(me.x, me.size), width - me.size);
  me.y = Math.min(Math.max(me.y, me.size), height - me.size);
}

canvas.addEventListener('mousemove', (e) => {
  if (!me) return;
  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  me.angle = Math.atan2(mouseY - me.y, mouseX - me.x);
});

canvas.addEventListener('click', () => {
  if (!me) return;
  socket.emit('shoot');
});

startBtn.onclick = () => {
  mainMenu.style.display = 'none';
  canvas.style.display = 'block';
  socket.emit('playerJoined');
};

socket.on('init', (data) => {
  players = data.players;
  bots = data.bots;
  me = players[socket.id];
  me.coins = 0;
  requestAnimationFrame(gameLoop);
});

socket.on('updatePlayers', (data) => {
  players = data;
  if (me) {
    me = players[socket.id];
  }
});

socket.on('updateBots', (data) => {
  bots = data;
});

socket.on('newProjectile', (p) => {
  projectiles[p.id] = p;
});

socket.on('removeProjectile', (id) => {
  delete projectiles[id];
});

socket.on('removePlayer', (id) => {
  delete players[id];
});

// COINS

socket.on('spawnCoin', (coin) => {
  coins[coin.id] = coin;
});

socket.on('removeCoin', (id) => {
  delete coins[id];
});

// Send player movement 60fps
setInterval(() => {
  if (!me) return;
  handleMovement();

  socket.emit('playerMovement', {
    x: me.x,
    y: me.y,
    angle: me.angle,
  });
}, 1000 / 60);
