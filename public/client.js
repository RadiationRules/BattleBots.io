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
let chests = {};
let leaderboard = [];

let mapWidth = 3000;
let mapHeight = 2000;

let upgradesPanelOpen = false;
let inGame = false;

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

  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    mousePos.x = e.clientX - rect.left;
    mousePos.y = e.clientY - rect.top;
  });

  window.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; });
  window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

  canvas.addEventListener('mousedown', () => {
    if (inGame) socket.emit('shoot');
  });

  canvas.addEventListener('click', e => {
    if (upgradesPanelOpen) {
      handleUpgradesClick(e.clientX, e.clientY);
    }
  });

  document.getElementById('playBtn').addEventListener('click', () => {
    const nameInput = document.getElementById('nameInput');
    let name = nameInput.value.trim().substring(0, 12);
    if (!name) name = 'Anon';

    socket.emit('playerJoined', name);
    inGame = true;
    document.getElementById('menu').style.display = 'none';
    document.getElementById('gameCanvas').style.display = 'block';
  });

  window.addEventListener('keydown', e => {
    if (e.key.toLowerCase() === 'u') upgradesPanelOpen = !upgradesPanelOpen;
  });

  requestAnimationFrame(gameLoop);
}

function resize() {
  width = window.innerWidth;
  height = window.innerHeight;
  if (canvas) {
    canvas.width = width;
    canvas.height = height;
  }
}

function sendMovement() {
  if (!playerId || !players[playerId]) return;

  const player = players[playerId];

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

  newX = Math.max(player.size, Math.min(newX, mapWidth - player.size));
  newY = Math.max(player.size, Math.min(newY, mapHeight - player.size));

  const angle = Math.atan2(mousePos.y - height / 2, mousePos.x - width / 2);

  socket.emit('playerMovement', { x: newX, y: newY, angle });
}

function roundedRect(ctx, x, y, w, h, r, fillStyle, strokeStyle) {
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

function drawBot(bot) {
  // Body gradient
  const grad = ctx.createRadialGradient(bot.x, bot.y, bot.size / 3, bot.x, bot.y, bot.size);
  grad.addColorStop(0, bot.color1);
  grad.addColorStop(1, bot.color2);

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(bot.x, bot.y, bot.size, 0, 2 * Math.PI);
  ctx.fill();

  // Name
  ctx.fillStyle = 'white';
  ctx.font = '14px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(bot.name, bot.x, bot.y - bot.size - 10);

  // Health bar
  ctx.fillStyle = '#333';
  ctx.fillRect(bot.x - bot.size, bot.y + bot.size + 6, bot.size * 2, 8);
  ctx.fillStyle = '#e74c3c';
  ctx.fillRect(bot.x - bot.size, bot.y + bot.size + 6, (bot.health / bot.maxHealth) * bot.size * 2, 8);
}

function drawPlayer(player) {
  // Body gradient
  const grad = ctx.createRadialGradient(player.x, player.y, player.size / 3, player.x, player.y, player.size);
  grad.addColorStop(0, player.color1);
  grad.addColorStop(1, player.color2);

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(player.x, player.y, player.size, 0, 2 * Math.PI);
  ctx.fill();

  // Name
  ctx.fillStyle = 'white';
  ctx.font = '16px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(player.name, player.x, player.y - player.size - 10);

  // Health bar
  ctx.fillStyle = '#333';
  ctx.fillRect(player.x - player.size, player.y + player.size + 8, player.size * 2, 8);
  ctx.fillStyle = '#27ae60';
  ctx.fillRect(player.x - player.size, player.y + player.size + 8, (player.health / player.maxHealth) * player.size * 2, 8);
}

function drawProjectile(p) {
  ctx.fillStyle = '#f1c40f';
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.size, 0, 2 * Math.PI);
  ctx.fill();
}

function drawCoin(c) {
  ctx.fillStyle = 'gold';
  ctx.beginPath();
  ctx.arc(c.x, c.y, c.size, 0, 2 * Math.PI);
  ctx.fill();
  ctx.fillStyle = '#b8860b';
  ctx.font = 'bold 14px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('₵', c.x, c.y + 5);
}

function drawChest(chest) {
  // Chest body
  ctx.fillStyle = '#8e44ad';
  ctx.strokeStyle = '#6c3483';
  ctx.lineWidth = 3;
  roundedRect(ctx, chest.x - chest.size / 2, chest.y - chest.size / 2, chest.size, chest.size, 6, '#8e44ad', '#6c3483');

  // Value text
  ctx.fillStyle = 'white';
  ctx.font = 'bold 16px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(chest.value + '₵', chest.x, chest.y + 6);
}

function drawMapBackground() {
  const padding = 20;
  const bgX = width / 2 - mapWidth / 2;
  const bgY = height / 2 - mapHeight / 2;

  ctx.save();
  ctx.translate(bgX, bgY);

  // Large translucent rounded rectangle as background
  roundedRect(ctx, 0, 0, mapWidth, mapHeight, 30, 'rgba(0,0,0,0.35)');
  ctx.restore();
}

function drawMiniMap() {
  const miniWidth = 200;
  const miniHeight = 130;
  const miniX = width - miniWidth - 20;
  const miniY = height - miniHeight - 20;

  ctx.save();

  // Background
  roundedRect(ctx, miniX, miniY, miniWidth, miniHeight, 15, 'rgba(0,0,0,0.7)');

  // Border
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.strokeRect(miniX, miniY, miniWidth, miniHeight);

  if (!playerId || !players[playerId]) {
    ctx.restore();
    return;
  }

  const p = players[playerId];

  // Scaling factor from map to minimap
  const scaleX = miniWidth / mapWidth;
  const scaleY = miniHeight / mapHeight;

  // Draw players as blue dots
  Object.values(players).forEach(pl => {
    ctx.fillStyle = (pl.id === playerId) ? '#3498db' : '#2980b9';
    const x = miniX + pl.x * scaleX;
    const y = miniY + pl.y * scaleY;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
  });

  // Draw bots as orange dots
  Object.values(bots).forEach(bot => {
    ctx.fillStyle = '#f39c12';
    const x = miniX + bot.x * scaleX;
    const y = miniY + bot.y * scaleY;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
  });

  // Draw chests as purple squares
  Object.values(chests).forEach(chest => {
    ctx.fillStyle = '#8e44ad';
    const x = miniX + chest.x * scaleX;
    const y = miniY + chest.y * scaleY;
    ctx.fillRect(x - 4, y - 4, 8, 8);
  });

  ctx.restore();
}

function drawLeaderboard() {
  const panelX = 20;
  const panelY = 20;
  const panelWidth = 260;
  const lineHeight = 28;

  // Background with padding for items + title
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.shadowColor = 'black';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  const heightNeeded = 40 + leaderboard.length * lineHeight;
  roundedRect(ctx, panelX, panelY, panelWidth, heightNeeded, 12, 'rgba(0,0,0,0.7)');

  ctx.shadowBlur = 0;

  ctx.fillStyle = 'white';
  ctx.font = '20px Segoe UI, Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Leaderboard', panelX + panelWidth / 2, panelY + 30);

  ctx.font = '16px Segoe UI, Arial';
  ctx.textAlign = 'left';

  leaderboard.forEach((p, i) => {
    const y = panelY + 55 + i * lineHeight;
    ctx.fillStyle = (p.id === playerId) ? '#2ecc71' : '#ecf0f1';

    // Draw player name with max 12 chars, truncate with ...
    const name = p.name.length > 12 ? p.name.substring(0, 10) + '...' : p.name;
    ctx.fillText(`${i + 1}. ${name}`, panelX + 12, y);
    ctx.fillText(`Score: ${p.score}`, panelX + 140, y);
    ctx.fillText(`Coins: ${p.coins}`, panelX + 210, y);
  });
}

function drawUpgradesPanel() {
  if (!upgradesPanelOpen) return;

  const panelX = 20;
  const panelY = 80;
  const panelWidth = 300;
  const panelHeight = 270;

  roundedRect(ctx, panelX, panelY, panelWidth, panelHeight, 15, 'rgba(0,0,0,0.85)');

  ctx.fillStyle = '#fff';
  ctx.font = '22px Segoe UI, Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Upgrades', panelX + panelWidth / 2, panelY + 35);

  ctx.font = '18px Segoe UI, Arial';
  ctx.textAlign = 'left';

  if (!playerId || !players[playerId]) return;
  const p = players[playerId];

  UPGRADES.forEach((key, i) => {
    const y = panelY + 75 + i * 40;
    const lvl = p.upgrades[key];
    const costBase = {damage:15, bulletSpeed:15, health:20, healthRegen:25, reload:30};
    const cost = costBase[key] * (lvl + 1);

    ctx.fillStyle = '#ecf0f1';
    ctx.fillText(`${UPGRADE_NAMES[key]}: Lv ${lvl}`, panelX + 20, y);
    ctx.fillText(`Cost: ${cost} ₵`, panelX + 200, y);

    // Draw buy button
    const btnX = panelX + panelWidth - 90;
    const btnY = y - 28;
    const btnW = 70;
    const btnH = 30;

    roundedRect(ctx, btnX, btnY, btnW, btnH, 8, (p.coins >= cost) ? '#27ae60' : '#7f8c8d');

    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = '18px Segoe UI, Arial';
    ctx.fillText('Buy', btnX + btnW / 2, btnY + 22);
  });
}

function handleUpgradesClick(x, y) {
  if (!upgradesPanelOpen) return;
  const panelX = 20;
  const panelY = 80;
  const panelWidth = 300;

  if (!playerId || !players[playerId]) return;
  const p = players[playerId];

  UPGRADES.forEach((key, i) => {
    const btnX = panelX + panelWidth - 90;
    const btnY = panelY + 75 + i * 40 - 28;
    const btnW = 70;
    const btnH = 30;

    if (x >= btnX && x <= btnX + btnW && y >= btnY && y <= btnY + btnH) {
      socket.emit('buyUpgrade', key);
    }
  });
}

function draw() {
  ctx.clearRect(0, 0, width, height);

  if (!playerId || !players[playerId]) return;

  const player = players[playerId];

  // Center camera on player
  ctx.save();
  ctx.translate(width / 2 - player.x, height / 2 - player.y);

  // Draw map background
  drawMapBackground();

  // Draw chests
  Object.values(chests).forEach(drawChest);

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
  drawMiniMap();

  // Instructions text
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = '18px Segoe UI, Arial';
  ctx.textAlign = 'left';
  ctx.fillText('Press U to toggle Upgrades Panel', 20, height - 50);
  ctx.fillText('WASD to move, Mouse to aim, Click to shoot', 20, height - 25);
}

function gameLoop() {
  sendMovement();
  draw();
  requestAnimationFrame(gameLoop);
}

// Socket handlers

socket.on('init', data => {
  players = data.players;
  bots = data.bots;
  coins = data.coins;
  chests = data.chests;
  projectiles = data.projectiles;
  mapWidth = data.mapWidth;
  mapHeight = data.mapHeight;
  playerId = socket.id;
  document.getElementById('loadingScreen').style.display = 'none';
});

socket.on('newPlayer', player => { players[player.id] = player; });
socket.on('updatePlayers', data => { players = data; });
socket.on('removePlayer', id => { delete players[id]; });

socket.on('updateBots', data => { bots = data; });
socket.on('newProjectile', proj => { projectiles[proj.id] = proj; });
socket.on('updateProjectiles', data => { projectiles = data; });
socket.on('removeProjectile', id => { delete projectiles[id]; });

socket.on('spawnCoin', coin => { coins[coin.id] = coin; });
socket.on('updateCoins', data => { coins = data; });
socket.on('removeCoin', id => { delete coins[id]; });

socket.on('updateChests', data => { chests = data; });
socket.on('removeChest', id => { delete chests[id]; });

socket.on('leaderboard', data => { leaderboard = data; });

window.onload = () => setup();
