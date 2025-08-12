const socket = io();

let canvas, ctx;
let width, height;
let mousePos = { x: 0, y: 0 };
let keys = {};
let playerId = null;

let players = {};
let bots = {};
let projectiles = {};
let coins = {};
let leaderboard = [];

let upgradesPanelOpen = false;

const UPGRADES = ['damage', 'bulletSpeed', 'health', 'healthRegen', 'reload'];
const UPGRADE_NAMES = {
  damage: 'Damage',
  bulletSpeed: 'Bullet Speed',
  health: 'Health',
  healthRegen: 'Health Regen',
  reload: 'Reload Speed',
};

function setup() {
  canvas = document.getElementById('gameCanvas');
  ctx = canvas.getContext('2d');
  resize();
  window.addEventListener('resize', resize);

  // Send mouse move
  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    mousePos.x = e.clientX - rect.left;
    mousePos.y = e.clientY - rect.top;
  });

  // Keyboard events
  window.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; });
  window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

  // Join game
  const playerName = prompt('Enter your name:', 'Anon');
  socket.emit('playerJoined', playerName || 'Anon');

  // Shoot on mouse click
  canvas.addEventListener('mousedown', () => socket.emit('shoot'));

  requestAnimationFrame(gameLoop);
}

function resize() {
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width;
  canvas.height = height;
}

// Send player movement to server
function sendMovement() {
  if (!playerId || !players[playerId]) return;

  const player = players[playerId];

  // WASD movement
  let dx = 0, dy = 0;
  if (keys['w']) dy -= 1;
  if (keys['s']) dy += 1;
  if (keys['a']) dx -= 1;
  if (keys['d']) dx += 1;

  const length = Math.hypot(dx, dy);
  if (length > 0) {
    dx /= length;
    dy /= length;
  }

  const speed = player.speed;
  let newX = player.x + dx * speed;
  let newY = player.y + dy * speed;

  // Clamp inside map
  newX = Math.max(player.size, Math.min(newX, 900 - player.size));
  newY = Math.max(player.size, Math.min(newY, 700 - player.size));

  // Calculate angle to mouse relative to player position on canvas
  const angle = Math.atan2(mousePos.y - height / 2, mousePos.x - width / 2);

  // Send to server if moved or angle changed
  if (Math.abs(newX - player.x) > 0.01 || Math.abs(newY - player.y) > 0.01 || Math.abs(angle - player.angle) > 0.01) {
    socket.emit('playerMovement', { x: newX, y: newY, angle });
  }
}

// Draw rounded rect helper
function roundedRect(ctx, x, y, width, height, radius, fillStyle, strokeStyle) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();

  if (fillStyle) {
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }
  if (strokeStyle) {
    ctx.strokeStyle = strokeStyle;
    ctx.stroke();
  }
}

// Draw player or bot with health bar and saw (for bot)
function drawBot(bot) {
  // Body circle gradient
  const grad = ctx.createRadialGradient(bot.x, bot.y, bot.size / 3, bot.x, bot.y, bot.size);
  grad.addColorStop(0, bot.color1);
  grad.addColorStop(1, bot.color2);

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(bot.x, bot.y, bot.size, 0, Math.PI * 2);
  ctx.fill();

  // Saw blade
  ctx.save();
  ctx.translate(bot.x, bot.y);
  ctx.rotate(bot.sawAngle);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(bot.size + 8, 0);
    ctx.stroke();
    ctx.rotate(Math.PI / 3);
  }
  ctx.restore();

  // Health bar background
  roundedRect(ctx, bot.x - bot.size, bot.y + bot.size + 8, bot.size * 2, 6, 3, '#555');

  // Health bar fill
  const healthRatio = bot.health / bot.maxHealth;
  roundedRect(ctx, bot.x - bot.size, bot.y + bot.size + 8, bot.size * 2 * healthRatio, 6, 3, '#2ecc71');
}

function drawPlayer(player) {
  // Body gradient
  const grad = ctx.createRadialGradient(player.x, player.y, player.size / 3, player.x, player.y, player.size);
  grad.addColorStop(0, player.color1);
  grad.addColorStop(1, player.color2);

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(player.x, player.y, player.size, 0, Math.PI * 2);
  ctx.fill();

  // Gun barrel
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.angle);
  ctx.fillStyle = '#333';
  ctx.fillRect(player.size - 4, -6, 20, 12);
  ctx.restore();

  // Health bar background
  roundedRect(ctx, player.x - player.size, player.y + player.size + 8, player.size * 2, 8, 4, '#555');

  // Health bar fill
  const healthRatio = player.health / player.maxHealth;
  roundedRect(ctx, player.x - player.size, player.y + player.size + 8, player.size * 2 * healthRatio, 8, 4, '#2ecc71');

  // Coins & Score
  ctx.fillStyle = '#fff';
  ctx.font = '14px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(`Coins: ${player.coins}`, player.x, player.y - player.size - 20);
  ctx.fillText(`Score: ${player.score}`, player.x, player.y - player.size - 6);
}

function drawProjectile(p) {
  ctx.fillStyle = '#e74c3c';
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
  ctx.fill();
}

function drawCoin(coin) {
  const grad = ctx.createRadialGradient(coin.x, coin.y, coin.size / 3, coin.x, coin.y, coin.size);
  grad.addColorStop(0, '#f1c40f');
  grad.addColorStop(1, '#f39c12');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(coin.x, coin.y, coin.size, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.stroke();
}

// Draw leaderboard
function drawLeaderboard() {
  const panelX = width - 200;
  const panelY = 40;
  const panelWidth = 180;
  const lineHeight = 24;

  // Background
  roundedRect(ctx, panelX, panelY, panelWidth, 24 + leaderboard.length * lineHeight, 8, 'rgba(0,0,0,0.7)');

  ctx.fillStyle = '#fff';
  ctx.font = '18px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Leaderboard', panelX + panelWidth / 2, panelY + 20);

  ctx.font = '16px Arial';
  ctx.textAlign = 'left';

  leaderboard.forEach((p, i) => {
    ctx.fillText(`${i + 1}. ${p.name}`, panelX + 10, panelY + 48 + i * lineHeight);
    ctx.fillText(`Score: ${p.score}`, panelX + 100, panelY + 48 + i * lineHeight);
    ctx.fillText(`Coins: ${p.coins}`, panelX + 150, panelY + 48 + i * lineHeight);
  });
}

// Draw upgrades panel
function drawUpgradesPanel() {
  if (!upgradesPanelOpen) return;

  const panelX = 20;
  const panelY = 40;
  const panelWidth = 300;
  const panelHeight = 270;

  roundedRect(ctx, panelX, panelY, panelWidth, panelHeight, 10, 'rgba(0,0,0,0.75)');

  ctx.fillStyle = '#fff';
  ctx.font = '20px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Upgrades', panelX + panelWidth / 2, panelY + 30);

  ctx.textAlign = 'left';
  ctx.font = '16px Arial';

  if (!playerId || !players[playerId]) return;
  const p = players[playerId];

  UPGRADES.forEach((key, i) => {
    const y = panelY + 70 + i * 35;
    const lvl = p.upgrades[key];
    const costBase = {damage:15, bulletSpeed:15, health:20, healthRegen:25, reload:30};
    const cost = costBase[key] * (lvl + 1);

    ctx.fillText(`${UPGRADE_NAMES[key]}: Lv ${lvl}`, panelX + 20, y);
    ctx.fillText(`Cost: ${cost} coins`, panelX + 200, y);

    // Draw buy button
    const btnX = panelX + panelWidth - 80;
    const btnY = y - 18;
    const btnW = 60;
    const btnH = 24;

    roundedRect(ctx, btnX, btnY, btnW, btnH, 5, (p.coins >= cost) ? '#27ae60' : '#7f8c8d');
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText('Buy', btnX + btnW / 2, btnY + 17);
  });
}

// Click handler for upgrades buy buttons
function handleUpgradesClick(x, y) {
  if (!upgradesPanelOpen) return;
  const panelX = 20;
  const panelY = 40;
  const panelWidth = 300;

  if (!playerId || !players[playerId]) return;
  const p = players[playerId];

  UPGRADES.forEach((key, i) => {
    const btnX = panelX + panelWidth - 80;
    const btnY = panelY + 70 + i * 35 - 18;
    const btnW = 60;
    const btnH = 24;

    if (x >= btnX && x <= btnX + btnW && y >= btnY && y <= btnY + btnH) {
      socket.emit('buyUpgrade', key);
    }
  });
}

// Main draw function
function draw() {
  ctx.clearRect(0, 0, width, height);

  // Draw map background
  const grd = ctx.createLinearGradient(0, 0, 0, height);
  grd.addColorStop(0, '#222');
  grd.addColorStop(1, '#111');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, width, height);

  // Translate so player is centered
  if (!playerId || !players[playerId]) return;
  const player = players[playerId];
  ctx.save();
  ctx.translate(width / 2 - player.x, height / 2 - player.y);

  // Draw coins
  Object.values(coins).forEach(drawCoin);

  // Draw bots
  Object.values(bots).forEach(drawBot);

  // Draw projectiles
  Object.values(projectiles).forEach(drawProjectile);

  // Draw players
  Object.values(players).forEach(drawPlayer);

  ctx.restore();

  drawLeaderboard();
  drawUpgradesPanel();

  // Draw UI buttons
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = '18px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('Press U to toggle Upgrades Panel', 20, height - 20);
}

function gameLoop() {
  sendMovement();
  draw();
  requestAnimationFrame(gameLoop);
}

// Socket events

socket.on('init', data => {
  players = data.players;
  bots = data.bots;
  coins = data.coins;
  projectiles = data.projectiles;
  playerId = socket.id;
});

socket.on('newPlayer', player => {
  players[player.id] = player;
});

socket.on('updatePlayers', data => {
  players = data;
});

socket.on('removePlayer', id => {
  delete players[id];
});

socket.on('updateBots', data => {
  bots = data;
});

socket.on('newProjectile', proj => {
  projectiles[proj.id] = proj;
});

socket.on('updateProjectiles', data => {
  projectiles = data;
});

socket.on('removeProjectile', id => {
  delete projectiles[id];
});

socket.on('spawnCoin', coin => {
  coins[coin.id] = coin;
});

socket.on('updateCoins', data => {
  coins = data;
});

socket.on('removeCoin', id => {
  delete coins[id];
});

socket.on('leaderboard', data => {
  leaderboard = data;
});

window.onload = () => {
  setup();
};

window.addEventListener('keydown', e => {
  if (e.key.toLowerCase() === 'u') upgradesPanelOpen = !upgradesPanelOpen;
});

canvas?.addEventListener('click', e => {
  handleUpgradesClick(e.clientX, e.clientY);
});
