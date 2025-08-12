const socket = io();

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const miniMap = document.getElementById('miniMap');

const mainMenu = document.getElementById('mainMenu');
const startBtn = document.getElementById('startBtn');
const nameInput = document.getElementById('nameInput');

const gameUI = document.getElementById('gameUI');
const playerNameDisplay = document.getElementById('playerName');
const healthText = document.getElementById('healthText');
const scoreText = document.getElementById('scoreText');
const coinsText = document.getElementById('coinsText');
const autoFireText = document.getElementById('autoFireText');

const leaderboardList = document.getElementById('leaderboardList');

const upgradePanel = document.getElementById('upgradePanel');
const buyButtons = document.querySelectorAll('.buyBtn');

const MAP_WIDTH = 1600;
const MAP_HEIGHT = 900;
const VIEW_WIDTH = canvas.width;
const VIEW_HEIGHT = canvas.height;

let players = {};
let bots = {};
let coins = {};
let chests = {};
let projectiles = {};

let myPlayerId = null;
let myPlayer = null;

let keys = {};
let mouse = { x: 0, y: 0 };
let mouseAngle = 0;

let autofire = false;
let lastAutoShot = 0;
const AUTO_FIRE_INTERVAL = 200;

let inGame = false;

// --- Event Listeners ---
startBtn.onclick = () => {
  const name = nameInput.value.trim();
  if (!name) return alert('Please enter a name.');
  myPlayerId = null;
  socket.emit('playerJoined', name);
  mainMenu.style.display = 'none';
  canvas.style.display = 'block';
  gameUI.style.display = 'flex';
  inGame = true;
};

window.addEventListener('keydown', (e) => {
  keys[e.key.toLowerCase()] = true;
  if (e.key.toLowerCase() === 'e' && inGame) {
    autofire = !autofire;
    autoFireText.textContent = autofire ? 'ON' : 'OFF';
    socket.emit('toggleAutofire');
  }
});

window.addEventListener('keyup', (e) => {
  keys[e.key.toLowerCase()] = false;
});

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = e.clientX - rect.left;
  mouse.y = e.clientY - rect.top;
  if (myPlayer) {
    mouseAngle = Math.atan2(mouse.y - VIEW_HEIGHT / 2, mouse.x - VIEW_WIDTH / 2);
  }
});

canvas.addEventListener('mousedown', (e) => {
  if (!inGame) return;
  socket.emit('shoot');
});

buyButtons.forEach(button => {
  button.addEventListener('click', () => {
    const upgradeType = button.getAttribute('data-type');
    socket.emit('buyUpgrade', upgradeType);
  });
});

// --- Socket Events ---

socket.on('init', (data) => {
  players = data.players;
  bots = data.bots;
  coins = data.coins;
  chests = data.chests;
  projectiles = data.projectiles;
  myPlayerId = socket.id;
  myPlayer = players[myPlayerId];
  updateStatsUI();
});

socket.on('newPlayer', (player) => {
  players[player.id] = player;
});

socket.on('updatePlayers', (updatedPlayers) => {
  players = updatedPlayers;
  myPlayer = players[myPlayerId];
  updateStatsUI();
});

socket.on('removePlayer', (id) => {
  delete players[id];
});

socket.on('updateBots', (updatedBots) => {
  bots = updatedBots;
});

socket.on('newProjectile', (proj) => {
  projectiles[proj.id] = proj;
});

socket.on('removeProjectile', (id) => {
  delete projectiles[id];
});

socket.on('updateProjectiles', (updatedProjectiles) => {
  projectiles = updatedProjectiles;
});

socket.on('spawnCoin', (coin) => {
  coins[coin.id] = coin;
});

socket.on('removeCoin', (id) => {
  delete coins[id];
});

socket.on('updateCoins', (updatedCoins) => {
  coins = updatedCoins;
});

socket.on('spawnChest', (chest) => {
  chests[chest.id] = chest;
});

socket.on('updateChest', (chest) => {
  chests[chest.id] = chest;
});

socket.on('updateChests', (updatedChests) => {
  chests = updatedChests;
});

socket.on('leaderboard', (topPlayers) => {
  leaderboardList.innerHTML = '';
  topPlayers.forEach(p => {
    const li = document.createElement('li');
    li.textContent = `${p.name}: ${p.score} pts (${p.coins} coins)`;
    leaderboardList.appendChild(li);
  });
});

// --- Helper functions ---

function updateStatsUI() {
  if (!myPlayer) return;
  playerNameDisplay.textContent = myPlayer.name;
  healthText.textContent = `${Math.floor(myPlayer.health)} / ${myPlayer.maxHealth}`;
  scoreText.textContent = myPlayer.score;
  coinsText.textContent = myPlayer.coins;
  autoFireText.textContent = autofire ? 'ON' : 'OFF';

  document.getElementById('damageLevel').textContent = myPlayer.upgrades.damage;
  document.getElementById('bulletSpeedLevel').textContent = myPlayer.upgrades.bulletSpeed;
  document.getElementById('healthLevel').textContent = myPlayer.upgrades.health;
  document.getElementById('regenLevel').textContent = myPlayer.upgrades.regen;
  document.getElementById('reloadLevel').textContent = myPlayer.upgrades.reload;
}

function sendMovement() {
  if (!myPlayer) return;

  // WASD or Arrow Keys for movement
  let dx = 0;
  let dy = 0;
  if (keys['w'] || keys['arrowup']) dy -= 1;
  if (keys['s'] || keys['arrowdown']) dy += 1;
  if (keys['a'] || keys['arrowleft']) dx -= 1;
  if (keys['d'] || keys['arrowright']) dx += 1;

  if (dx !== 0 || dy !== 0) {
    const length = Math.hypot(dx, dy);
    dx /= length;
    dy /= length;

    myPlayer.x += dx * myPlayer.speed;
    myPlayer.y += dy * myPlayer.speed;

    // Clamp inside map
    myPlayer.x = Math.max(myPlayer.size, Math.min(myPlayer.x, MAP_WIDTH - myPlayer.size));
    myPlayer.y = Math.max(myPlayer.size, Math.min(myPlayer.y, MAP_HEIGHT - myPlayer.size));
  }

  // Send position and angle
  socket.emit('playerMovement', {
    x: myPlayer.x,
    y: myPlayer.y,
    angle: mouseAngle,
  });
}

function draw() {
  if (!myPlayer) return;

  // Clear canvas with subtle background pattern
  ctx.clearRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
  drawMapBackground();

  // Calculate camera offset so player stays centered
  const camX = Math.min(Math.max(myPlayer.x - VIEW_WIDTH / 2, 0), MAP_WIDTH - VIEW_WIDTH);
  const camY = Math.min(Math.max(myPlayer.y - VIEW_HEIGHT / 2, 0), MAP_HEIGHT - VIEW_HEIGHT);

  // Draw coins
  for (const id in coins) {
    const coin = coins[id];
    drawCoin(coin.x - camX, coin.y - camY, coin.size);
  }

  // Draw chests
  for (const id in chests) {
    const chest = chests[id];
    drawChest(chest.x - camX, chest.y - camY, chest.size, chest.opened);
  }

  // Draw bots
  for (const id in bots) {
    const bot = bots[id];
    drawBot(bot.x - camX, bot.y - camY, bot);
  }

  // Draw players
  for (const id in players) {
    const p = players[id];
    drawPlayer(p.x - camX, p.y - camY, p);
  }

  // Draw projectiles
  for (const id in projectiles) {
    const p = projectiles[id];
    drawProjectile(p.x - camX, p.y - camY, p);
  }

  // Draw health bars on players and bots
  for (const id in bots) {
    const bot = bots[id];
    drawHealthBar(bot.x - camX, bot.y - camY - bot.size - 10, bot.health, bot.maxHealth);
  }
  for (const id in players) {
    const p = players[id];
    drawHealthBar(p.x - camX, p.y - camY - p.size - 10, p.health, p.maxHealth);
  }

  // Draw mini map
  drawMiniMap(camX, camY);
}

// --- Draw helper functions ---
function drawMapBackground() {
  // subtle grid lines
  ctx.fillStyle = '#121212';
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

  ctx.strokeStyle = '#222222';
  ctx.lineWidth = 1;
  for (let x = 0; x < MAP_WIDTH; x += 100) {
    const drawX = x - Math.min(Math.max(myPlayer.x - VIEW_WIDTH / 2, 0), MAP_WIDTH - VIEW_WIDTH);
    if (drawX < 0 || drawX > VIEW_WIDTH) continue;
    ctx.beginPath();
    ctx.moveTo(drawX, 0);
    ctx.lineTo(drawX, VIEW_HEIGHT);
    ctx.stroke();
  }
  for (let y = 0; y < MAP_HEIGHT; y += 100) {
    const drawY = y - Math.min(Math.max(myPlayer.y - VIEW_HEIGHT / 2, 0), MAP_HEIGHT - VIEW_HEIGHT);
    if (drawY < 0 || drawY > VIEW_HEIGHT) continue;
    ctx.beginPath();
    ctx.moveTo(0, drawY);
    ctx.lineTo(VIEW_WIDTH, drawY);
    ctx.stroke();
  }
}

function drawCoin(x, y, size) {
  ctx.fillStyle = 'gold';
  ctx.beginPath();
  ctx.arc(x, y, size, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#b8860b';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawChest(x, y, size, opened) {
  ctx.fillStyle = opened ? '#444' : '#ffb700';
  ctx.strokeStyle = opened ? '#999' : '#cc9900';
  ctx.lineWidth = 3;
  ctx.fillRect(x - size / 2, y - size / 2, size, size);
  ctx.strokeRect(x - size / 2, y - size / 2, size, size);
}

function drawBot(x, y, bot) {
  // Body
  const grad = ctx.createLinearGradient(x - bot.size, y - bot.size, x + bot.size, y + bot.size);
  grad.addColorStop(0, bot.color1);
  grad.addColorStop(1, bot.color2);

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, bot.size, 0, Math.PI * 2);
  ctx.fill();

  // Saw blade (rotating)
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(bot.sawAngle);
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 5;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(bot.size * 1.4, 0);
    ctx.stroke();
    ctx.rotate(Math.PI / 3);
  }
  ctx.restore();

  // Name text
  ctx.fillStyle = '#0ff';
  ctx.font = '14px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(bot.name, x, y + bot.size + 16);
}

function drawPlayer(x, y, p) {
  // Body gradient
  const grad = ctx.createRadialGradient(x, y, p.size / 2, x, y, p.size);
  grad.addColorStop(0, p.color1);
  grad.addColorStop(1, p.color2);

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, p.size, 0, Math.PI * 2);
  ctx.fill();

  // Direction barrel
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(p.angle);
  ctx.fillStyle = '#222';
  ctx.fillRect(0, -6, p.size + 15, 12);
  ctx.restore();

  // Name text
  ctx.fillStyle = '#0ff';
  ctx.font = '14px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(p.name, x, y + p.size + 16);
}

function drawProjectile(x, y, p) {
  ctx.fillStyle = p.isBotBullet ? '#f44336' : '#00ffff';
  ctx.beginPath();
  ctx.arc(x, y, p.size, 0, Math.PI * 2);
  ctx.fill();
}

function drawHealthBar(x, y, health, maxHealth) {
  const width = 50;
  const height = 6;
  ctx.fillStyle = '#333';
  ctx.fillRect(x - width / 2, y, width, height);

  const healthWidth = (health / maxHealth) * width;
  ctx.fillStyle = health > maxHealth * 0.5 ? '#0f0' : (health > maxHealth * 0.2 ? '#ff0' : '#f00');
  ctx.fillRect(x - width / 2, y, healthWidth, height);

  ctx.strokeStyle = '#000';
  ctx.strokeRect(x - width / 2, y, width, height);
}

function drawMiniMap(camX, camY) {
  const mmCtx = miniMap.getContext('2d');
  mmCtx.clearRect(0, 0, miniMap.width, miniMap.height);

  const scaleX = miniMap.width / MAP_WIDTH;
  const scaleY = miniMap.height / MAP_HEIGHT;

  // Background
  mmCtx.fillStyle = 'rgba(0,0,50,0.8)';
  mmCtx.fillRect(0, 0, miniMap.width, miniMap.height);

  // Draw chests
  for (const id in chests) {
    const c = chests[id];
    mmCtx.fillStyle = c.opened ? '#555' : '#ffb700';
    mmCtx.fillRect(c.x * scaleX - 2, c.y * scaleY - 2, 4, 4);
  }

  // Draw coins
  for (const id in coins) {
    const c = coins[id];
    mmCtx.fillStyle = 'gold';
    mmCtx.beginPath();
    mmCtx.arc(c.x * scaleX, c.y * scaleY, 2, 0, Math.PI * 2);
    mmCtx.fill();
  }

  // Draw bots
  for (const id in bots) {
    const b = bots[id];
    mmCtx.fillStyle = '#f39c12';
    mmCtx.fillRect(b.x * scaleX - 3, b.y * scaleY - 3, 6, 6);
  }

  // Draw players
  for (const id in players) {
    const p = players[id];
    mmCtx.fillStyle = (id === myPlayerId) ? '#00ffff' : '#2980b9';
    mmCtx.beginPath();
    mmCtx.arc(p.x * scaleX, p.y * scaleY, 4, 0, Math.PI * 2);
    mmCtx.fill();
  }

  // Draw player viewport rectangle
  mmCtx.strokeStyle = '#00ffff';
  mmCtx.lineWidth = 1;
  mmCtx.strokeRect(camX * scaleX, camY * scaleY, VIEW_WIDTH * scaleX, VIEW_HEIGHT * scaleY);
}

// --- Main Loop ---
function gameLoop() {
  if (!inGame) return;

  sendMovement();

  if (autofire) {
    const now = Date.now();
    if (now - lastAutoShot > AUTO_FIRE_INTERVAL) {
      socket.emit('shoot');
      lastAutoShot = now;
    }
  }

  draw();

  requestAnimationFrame(gameLoop);
}

gameLoop();
