const socket = io();

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const hud = document.getElementById('hud');
const mainMenu = document.getElementById('main-menu');
const startGameBtn = document.getElementById('startGameBtn');
const playerNameInput = document.getElementById('playerNameInput');
const modeRadios = document.querySelectorAll('input[name="mode"]');

const scoreEl = document.getElementById('score');
const coinsEl = document.getElementById('coins');
const teamScoreEl = document.getElementById('teamScore');

const leaderboardList = document.getElementById('leaderboardList');

const upgradesPanel = document.getElementById('upgradesPanel');
const upgradeButtons = document.querySelectorAll('.upgradeBtn');

const chatContainer = document.getElementById('chatContainer');
const toggleChatBtn = document.getElementById('toggleChatBtn');
const chatBox = document.getElementById('chatBox');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');

let gameStarted = false;

let players = {};
let bots = {};
let projectiles = {};
let coins = {};

let playerId = null;
let player = null;

let keys = {};
let mouse = { x: 0, y: 0, down: false };

let camera = { x: 0, y: 0, lerpX: 0, lerpY: 0 };

const MAP_WIDTH = 2000;
const MAP_HEIGHT = 1500;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clearScreen() {
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawPlayer(p) {
  const posX = p.x - camera.x;
  const posY = p.y - camera.y;

  // Draw body
  ctx.save();
  ctx.translate(posX, posY);
  ctx.rotate(p.angle);

  // Body circle with gradient fill
  let grad = ctx.createRadialGradient(0, 0, p.size/3, 0, 0, p.size);
  grad.addColorStop(0, p.color1);
  grad.addColorStop(1, p.color2);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, p.size, 0, Math.PI * 2);
  ctx.fill();

  // Draw turret barrel
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(p.size * 1.5, 0);
  ctx.stroke();

  // Draw eyes
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(p.size/3, -p.size/3, p.size/6, 0, Math.PI*2);
  ctx.arc(p.size/3, p.size/3, p.size/6, 0, Math.PI*2);
  ctx.fill();

  // Pupils
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(p.size/3 + Math.cos(p.angle) * 3, -p.size/3 + Math.sin(p.angle) * 3, p.size/12, 0, Math.PI*2);
  ctx.arc(p.size/3 + Math.cos(p.angle) * 3, p.size/3 + Math.sin(p.angle) * 3, p.size/12, 0, Math.PI*2);
  ctx.fill();

  ctx.restore();

  // Health bar background
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(posX - p.size, posY - p.size - 15, p.size * 2, 8);

  // Health bar fill
  const healthRatio = p.health / p.maxHealth;
  ctx.fillStyle = healthRatio > 0.6 ? '#2ecc71' : healthRatio > 0.3 ? '#f1c40f' : '#e74c3c';
  ctx.fillRect(posX - p.size, posY - p.size - 15, p.size * 2 * healthRatio, 8);

  // Name
  ctx.fillStyle = 'white';
  ctx.font = 'bold 14px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(p.name || 'Player', posX, posY - p.size - 25);
}

function drawBot(bot) {
  const posX = bot.x - camera.x;
  const posY = bot.y - camera.y;

  ctx.save();
  ctx.translate(posX, posY);
  ctx.rotate(bot.angle);

  // Body circle gradient
  let grad = ctx.createRadialGradient(0, 0, bot.size/3, 0, 0, bot.size);
  grad.addColorStop(0, bot.color1);
  grad.addColorStop(1, bot.color2);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, bot.size, 0, Math.PI * 2);
  ctx.fill();

  // Saw blade
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i < 12; i++) {
    const angle = bot.sawAngle + (i * Math.PI / 6);
    ctx.moveTo(Math.cos(angle) * (bot.size + 5), Math.sin(angle) * (bot.size + 5));
    ctx.lineTo(Math.cos(angle) * (bot.size + 15), Math.sin(angle) * (bot.size + 15));
  }
  ctx.stroke();

  ctx.restore();

  // Health bar background
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(posX - bot.size, posY - bot.size - 15, bot.size * 2, 8);

  // Health bar fill
  const healthRatio = bot.health / bot.maxHealth;
  ctx.fillStyle = healthRatio > 0.6 ? '#2ecc71' : healthRatio > 0.3 ? '#f1c40f' : '#e74c3c';
  ctx.fillRect(posX - bot.size, posY - bot.size - 15, bot.size * 2 * healthRatio, 8);

  // Name
  ctx.fillStyle = 'white';
  ctx.font = 'bold 14px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(bot.name, posX, posY - bot.size - 25);
}

function drawProjectile(p) {
  const posX = p.x - camera.x;
  const posY = p.y - camera.y;

  ctx.fillStyle = '#f39c12';
  ctx.beginPath();
  ctx.arc(posX, posY, p.size, 0, Math.PI * 2);
  ctx.fill();
}

function drawCoin(c) {
  const posX = c.x - camera.x;
  const posY = c.y - camera.y;

  ctx.fillStyle = 'gold';
  ctx.beginPath();
  ctx.arc(posX, posY, c.size, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'white';
  ctx.font = 'bold 12px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(`+${c.value}`, posX, posY + 4);
}

function drawMinimap() {
  const mapWidth = 200;
  const mapHeight = 150;
  const padding = 10;
  const miniX = canvas.width - mapWidth - padding;
  const miniY = canvas.height - mapHeight - padding;

  ctx.save();
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = '#222';
  ctx.fillRect(miniX, miniY, mapWidth, mapHeight);

  // Border
  ctx.strokeStyle = '#1e90ff';
  ctx.lineWidth = 2;
  ctx.strokeRect(miniX, miniY, mapWidth, mapHeight);

  // Draw coins
  for (const coinId in coins) {
    const coin = coins[coinId];
    const x = miniX + (coin.x / MAP_WIDTH) * mapWidth;
    const y = miniY + (coin.y / MAP_HEIGHT) * mapHeight;
    ctx.fillStyle = 'gold';
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw bots
  for (const botId in bots) {
    const bot = bots[botId];
    const x = miniX + (bot.x / MAP_WIDTH) * mapWidth;
    const y = miniY + (bot.y / MAP_HEIGHT) * mapHeight;

    ctx.fillStyle = bot.team === 'red' ? '#e74c3c' : bot.team === 'blue' ? '#3498db' : '#f39c12';
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw players
  for (const playerId in players) {
    const p = players[playerId];
    const x = miniX + (p.x / MAP_WIDTH) * mapWidth;
    const y = miniY + (p.y / MAP_HEIGHT) * mapHeight;
    ctx.fillStyle = p.team === 'red' ? '#e74c3c' : p.team === 'blue' ? '#3498db' : '#1e90ff';
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawUI() {
  scoreEl.textContent = player.score;
  coinsEl.textContent = player.coins;

  if (player.team) {
    teamScoreEl.textContent = player.team === 'red' ? currentTeamScores.red : currentTeamScores.blue;
  } else {
    teamScoreEl.textContent = '-';
  }
}

let currentTeamScores = { red: 0, blue: 0 };

function gameLoop() {
  if (!gameStarted || !player) return;

  // Smooth camera follow
  camera.lerpX = lerp(camera.lerpX, player.x - canvas.width / 2, 0.1);
  camera.lerpY = lerp(camera.lerpY, player.y - canvas.height / 2, 0.1);
  camera.x = camera.lerpX;
  camera.y = camera.lerpY;

  clearScreen();

  // Draw map grid
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 1;
  const gridSize = 100;
  for (let x = - (camera.x % gridSize); x < canvas.width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = - (camera.y % gridSize); y < canvas.height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  // Draw coins
  Object.values(coins).forEach(drawCoin);

  // Draw bots
  Object.values(bots).forEach(drawBot);

  // Draw players
  Object.values(players).forEach(drawPlayer);

  // Draw projectiles
  Object.values(projectiles).forEach(drawProjectile);

  drawMinimap();

  drawUI();

  requestAnimationFrame(gameLoop);
}

function sendMovement() {
  if (!player) return;
  socket.emit('playerMovement', { x: player.x, y: player.y, angle: player.angle });
}

function updateFromServer(data) {
  players = data.players;
  bots = data.bots;
  projectiles = data.projectiles;
  coins = data.coins;
  player = players[playerId];
}

startGameBtn.onclick = () => {
  const name = playerNameInput.value.trim() || "Player";
  let mode = 'free';
  modeRadios.forEach(r => {
    if (r.checked) mode = r.value;
  });

  socket.emit('playerJoin', { name, mode });
  playerId = socket.id;

  mainMenu.style.display = 'none';
  canvas.style.display = 'block';
  hud.classList.remove('hidden');

  gameStarted = true;
  requestAnimationFrame(gameLoop);
};

document.addEventListener('keydown', e => {
  keys[e.key.toLowerCase()] = true;

  if (e.key === 'Enter') {
    if (document.activeElement === chatInput) {
      if (chatInput.value.trim().length > 0) {
        socket.emit('chatMessage', chatInput.value.trim());
        chatInput.value = '';
      }
    }
  }
});

document.addEventListener('keyup', e => {
  keys[e.key.toLowerCase()] = false;
});

canvas.addEventListener('mousemove', e => {
  if (!player) return;

  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  player.angle = Math.atan2(mouseY - canvas.height / 2, mouseX - canvas.width / 2);

  sendMovement();
});

canvas.addEventListener('mousedown', e => {
  if (!player) return;
  socket.emit('shoot');
});

toggleChatBtn.onclick = () => {
  chatBox.classList.toggle('hidden');
  if (!chatBox.classList.contains('hidden')) chatInput.focus();
};

socket.on('init', data => {
  players = data.players;
  bots = data.bots;
  projectiles = data.projectiles;
  coins = data.coins;
  player = players[socket.id];
  playerId = socket.id;
});

socket.on('newPlayer', p => {
  players[p.id] = p;
});

socket.on('removePlayer', id => {
  delete players[id];
});

socket.on('updatePlayers', data => {
  players = data;
  player = players[playerId];
});

socket.on('updateBots', data => {
  bots = data;
});

socket.on('newProjectile', proj => {
  projectiles[proj.id] = proj;
});

socket.on('removeProjectile', id => {
  delete projectiles[id];
});

socket.on('updateProjectiles', data => {
  projectiles = data;
});

socket.on('updateCoins', data => {
  coins = data;
});

socket.on('spawnCoin', coin => {
  coins[coin.id] = coin;
});

socket.on('chatMessage', msg => {
  const color = msg.team === 'red' ? '#e74c3c' : msg.team === 'blue' ? '#3498db' : '#1e90ff';
  const messageEl = document.createElement('div');
  messageEl.innerHTML = `<strong style="color:${color}">${msg.name}:</strong> ${msg.message}`;
  chatMessages.appendChild(messageEl);
  chatMessages.scrollTop = chatMessages.scrollHeight;
});

socket.on('leaderboard', list => {
  leaderboardList.innerHTML = '';
  list.forEach(p => {
    const li = document.createElement('li');
    const color = p.team === 'red' ? '#e74c3c' : p.team === 'blue' ? '#3498db' : '#1e90ff';
    li.innerHTML = `<span style="color:${color}">${p.name}</span><span>${p.score}</span>`;
    leaderboardList.appendChild(li);
  });
});

socket.on('teamScores', scores => {
  currentTeamScores = scores;
});

upgradeButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const upgrade = btn.getAttribute('data-upgrade');
    socket.emit('upgrade', upgrade);
  });
});
