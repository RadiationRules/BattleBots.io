const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const PORT = process.env.PORT || 5000;

const MAP_WIDTH = 3000;
const MAP_HEIGHT = 2000;

const PLAYER_BASE_SIZE = 30;
const BOT_BASE_SIZE = 30;
const COIN_SIZE = 12;
const CHEST_SIZE = 25;
const PROJECTILE_BASE_SIZE = 6;

const SHOOT_COOLDOWN_BASE = 300; // ms
const BOT_COUNT = 12;
const CHEST_COUNT = 10;

// Names for bots
const BOT_NAMES = [
  'Sliker', 'Tung Sahur', 'YourMom', 'ByteCrusher', 'MegaBot', 
  'Rusty', 'ZapZing', 'CrusherX', 'IronClad', 'NeonFlash', 'TurboBot', 'Omega'
];

app.use(express.static('public'));

// Game state
const players = {};
const bots = {};
const projectiles = {};
const coins = {};
const chests = {};

let botIdCounter = 1;
let projectileIdCounter = 1;
let coinIdCounter = 1;
let chestIdCounter = 1;

function randomPos(size) {
  return {
    x: Math.random() * (MAP_WIDTH - size * 2) + size,
    y: Math.random() * (MAP_HEIGHT - size * 2) + size,
  };
}

function createBot() {
  const pos = randomPos(BOT_BASE_SIZE);
  const name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
  return {
    id: 'bot' + botIdCounter++,
    name,
    x: pos.x,
    y: pos.y,
    size: BOT_BASE_SIZE,
    health: 100,
    maxHealth: 100,
    speed: 2,
    angle: Math.random() * Math.PI * 2,
    sawAngle: 0,
    color1: '#f39c12',
    color2: '#e67e22',
  };
}

function createCoin(x, y) {
  return {
    id: 'coin' + coinIdCounter++,
    x,
    y,
    size: COIN_SIZE,
    value: 1,
  };
}

function createChest() {
  const pos = randomPos(CHEST_SIZE);
  const value = Math.random() < 0.7 ? 10 : 25; // 70% 10 coins, 30% 25 coins
  return {
    id: 'chest' + chestIdCounter++,
    x: pos.x,
    y: pos.y,
    size: CHEST_SIZE,
    value,
  };
}

// Spawn bots
for (let i = 0; i < BOT_COUNT; i++) {
  bots['bot' + i] = createBot();
}
// Spawn chests
for (let i = 0; i < CHEST_COUNT; i++) {
  const c = createChest();
  chests[c.id] = c;
}

// Leaderboard broadcast every second
function broadcastLeaderboard() {
  const topPlayers = Object.values(players)
    .sort((a, b) => b.score - a.score)
    .slice(0, 7)
    .map(p => ({
      id: p.id,
      score: p.score,
      coins: p.coins,
      upgrades: p.upgrades,
      name: p.name || 'Anon',
    }));
  io.emit('leaderboard', topPlayers);
}

// Validate position inside map (anti-cheat)
function clampPos(x, y, size) {
  return {
    x: Math.max(size, Math.min(x, MAP_WIDTH - size)),
    y: Math.max(size, Math.min(y, MAP_HEIGHT - size)),
  };
}

io.on('connection', socket => {
  console.log('Player connected:', socket.id);

  socket.on('playerJoined', (name) => {
    const pos = randomPos(PLAYER_BASE_SIZE);
    players[socket.id] = {
      id: socket.id,
      name: name.trim().substring(0, 12) || 'Anon',
      x: pos.x,
      y: pos.y,
      size: PLAYER_BASE_SIZE,
      health: 100,
      maxHealth: 100,
      score: 0,
      coins: 0,
      angle: 0,
      color1: '#3498db',
      color2: '#2980b9',
      lastShot: 0,
      speed: 4,
      damage: 20,
      reload: SHOOT_COOLDOWN_BASE,
      bulletSpeed: 12,
      healthRegen: 0.05,
      upgrades: {
        damage: 0,
        bulletSpeed: 0,
        health: 0,
        healthRegen: 0,
        reload: 0,
      }
    };

    socket.emit('init', { players, bots, coins, projectiles, chests, mapWidth: MAP_WIDTH, mapHeight: MAP_HEIGHT });
    socket.broadcast.emit('newPlayer', players[socket.id]);
  });

  // Player movement + anti-cheat clamp position
  socket.on('playerMovement', data => {
    const player = players[socket.id];
    if (!player) return;

    const clamped = clampPos(data.x, data.y, player.size);
    player.x = clamped.x;
    player.y = clamped.y;
    player.angle = data.angle;

    io.emit('updatePlayers', players);
  });

  socket.on('shoot', () => {
    const player = players[socket.id];
    if (!player) return;

    const now = Date.now();
    if (now - player.lastShot < player.reload) return; // cooldown

    player.lastShot = now;

    const bulletOffset = player.size + 8;
    const projectile = {
      id: 'p' + projectileIdCounter++,
      x: player.x + Math.cos(player.angle) * bulletOffset,
      y: player.y + Math.sin(player.angle) * bulletOffset,
      angle: player.angle,
      speed: player.bulletSpeed,
      owner: socket.id,
      size: PROJECTILE_BASE_SIZE,
      damage: player.damage,
    };

    projectiles[projectile.id] = projectile;
    io.emit('newProjectile', projectile);
  });

  // Player upgrades
  socket.on('buyUpgrade', (upgrade) => {
    const player = players[socket.id];
    if (!player) return;

    const costBase = {
      damage: 15,
      bulletSpeed: 15,
      health: 20,
      healthRegen: 25,
      reload: 30,
    };

    if (!costBase[upgrade]) return;

    const cost = costBase[upgrade] * (player.upgrades[upgrade] + 1);
    if (player.coins >= cost) {
      player.coins -= cost;
      player.upgrades[upgrade]++;
      switch (upgrade) {
        case 'damage': player.damage += 5; break;
        case 'bulletSpeed': player.bulletSpeed += 2; break;
        case 'health': 
          player.maxHealth += 20;
          player.health += 20;
          break;
        case 'healthRegen': player.healthRegen += 0.02; break;
        case 'reload': player.reload = Math.max(50, player.reload - 25); break;
      }
      io.emit('updatePlayers', players);
    }
  });

  // Player collects coin
  socket.on('collectCoin', (coinId) => {
    const player = players[socket.id];
    if (!player) return;
    if (!coins[coinId]) return;

    player.coins += coins[coinId].value;
    io.emit('removeCoin', coinId);
    delete coins[coinId];
    io.emit('updatePlayers', players);
  });

  // Player collects chest
  socket.on('collectChest', (chestId) => {
    const player = players[socket.id];
    if (!player) return;
    if (!chests[chestId]) return;

    player.coins += chests[chestId].value;
    io.emit('removeChest', chestId);
    delete chests[chestId];
    io.emit('updatePlayers', players);
  });

  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    delete players[socket.id];
    io.emit('removePlayer', socket.id);
  });
});

setInterval(() => {
  // Bots move and bounce
  for (const id in bots) {
    const bot = bots[id];
    bot.x += Math.cos(bot.angle) * bot.speed;
    bot.y += Math.sin(bot.angle) * bot.speed;

    if (bot.x < bot.size || bot.x > MAP_WIDTH - bot.size) bot.angle = Math.PI - bot.angle;
    if (bot.y < bot.size || bot.y > MAP_HEIGHT - bot.size) bot.angle = -bot.angle;

    bot.sawAngle += 0.15;
    bot.health = Math.min(bot.health + 0.02, bot.maxHealth);
    bot.angle += (Math.random() - 0.5) * 0.2;
  }

  // Move projectiles & collisions
  for (const id in projectiles) {
    const p = projectiles[id];
    p.x += Math.cos(p.angle) * p.speed;
    p.y += Math.sin(p.angle) * p.speed;

    if (p.x < 0 || p.x > MAP_WIDTH || p.y < 0 || p.y > MAP_HEIGHT) {
      delete projectiles[id];
      io.emit('removeProjectile', id);
      continue;
    }

    for (const botId in bots) {
      const bot = bots[botId];
      const dist = Math.hypot(bot.x - p.x, bot.y - p.y);
      if (dist < bot.size + p.size) {
        bot.health -= p.damage;
        if (players[p.owner]) players[p.owner].score++;
        if (bot.health <= 0) {
          const coin = createCoin(bot.x, bot.y);
          coins[coin.id] = coin;
          io.emit('spawnCoin', coin);

          bots[botId] = createBot();

          if (players[p.owner]) {
            players[p.owner].score += 10;
            players[p.owner].coins += coin.value;
          }
        }
        delete projectiles[id];
        io.emit('removeProjectile', id);
        io.emit('updateBots', bots);
        io.emit('updatePlayers', players);
        break;
      }
    }
  }

  // Player health regen + pickups
  for (const playerId in players) {
    const player = players[playerId];
    player.health = Math.min(player.health + player.healthRegen, player.maxHealth);

    for (const coinId in coins) {
      const coin = coins[coinId];
      const dist = Math.hypot(player.x - coin.x, player.y - coin.y);
      if (dist < player.size + coin.size) {
        player.coins += coin.value;
        player.score += coin.value * 5;
        io.emit('removeCoin', coin.id);
        delete coins[coinId];
        io.emit('updatePlayers', players);
      }
    }

    for (const chestId in chests) {
      const chest = chests[chestId];
      const dist = Math.hypot(player.x - chest.x, player.y - chest.y);
      if (dist < player.size + chest.size) {
        player.coins += chest.value;
        io.emit('removeChest', chest.id);
        delete chests[chestId];
        io.emit('updatePlayers', players);
      }
    }
  }

  io.emit('updateBots', bots);
  io.emit('updateProjectiles', projectiles);
  io.emit('updateCoins', coins);
  io.emit('updateChests', chests);
  io.emit('updatePlayers', players);
}, 50);

setInterval(() => {
  broadcastLeaderboard();
}, 1000);

http.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
