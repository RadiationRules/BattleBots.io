const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const PORT = process.env.PORT || 5000;

app.use(express.static('public'));

// Game constants
const MAP_WIDTH = 2000;
const MAP_HEIGHT = 1500;
const PLAYER_SIZE = 30;
const BOT_SIZE = 30;
const COIN_SIZE = 12;
const CHEST_SIZE = 25;
const PROJECTILE_SIZE = 6;
const PROJECTILE_SPEED = 14;
const PLAYER_SPEED = 5;
const BOT_SPEED = 2;
const SHOOT_COOLDOWN = 300; // ms

// Game state containers
const players = {};
const bots = {};
const projectiles = {};
const coins = {};
const chests = {};

let botIdCounter = 1;
let projectileIdCounter = 1;
let coinIdCounter = 1;
let chestIdCounter = 1;

// Utility for random position with padding
function randomPosition(size) {
  return {
    x: Math.random() * (MAP_WIDTH - size * 2) + size,
    y: Math.random() * (MAP_HEIGHT - size * 2) + size,
  };
}

// Create bot with name and AI shoot cooldown
const BOT_NAMES = [
  'Sliker', 'Tung Sahur', 'YourMom', 'RoboRage', 'BitCrusher',
  'MechaMax', 'VoltViper', 'CyberClaw', 'NanoNash', 'SteelStrike'
];

function createBot() {
  const pos = randomPosition(BOT_SIZE);
  return {
    id: 'bot' + botIdCounter++,
    name: BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)],
    x: pos.x,
    y: pos.y,
    size: BOT_SIZE,
    health: 100,
    maxHealth: 100,
    speed: BOT_SPEED,
    angle: Math.random() * Math.PI * 2,
    sawAngle: 0,
    color1: '#f39c12',
    color2: '#e67e22',
    lastShot: 0,
    shootCooldown: 800, // bots shoot nerfed cooldown (800ms)
  };
}

// Create coin object
function createCoin(x, y, value = 1) {
  return {
    id: 'coin' + coinIdCounter++,
    x, y,
    size: COIN_SIZE,
    value,
  };
}

// Create chest with multiple coins
function createChest(x, y, coinAmount = 10) {
  return {
    id: 'chest' + chestIdCounter++,
    x, y,
    size: CHEST_SIZE,
    coins: coinAmount,
  };
}

// Spawn initial bots and chests
for (let i = 0; i < 8; i++) bots['bot' + i] = createBot();
for (let i = 0; i < 10; i++) {
  const pos = randomPosition(CHEST_SIZE);
  chests['chest' + i] = createChest(pos.x, pos.y, Math.random() > 0.5 ? 10 : 25);
}

// Leaderboard broadcast helper
function broadcastLeaderboard() {
  const topPlayers = Object.values(players)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(p => ({ id: p.id, name: p.name, score: p.score, coins: p.coins || 0 }));
  io.emit('leaderboard', topPlayers);
}

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  socket.on('playerJoined', (name) => {
    const pos = randomPosition(PLAYER_SIZE);
    players[socket.id] = {
      id: socket.id,
      name: name || 'NoName',
      x: pos.x,
      y: pos.y,
      size: PLAYER_SIZE,
      health: 100,
      maxHealth: 100,
      score: 0,
      coins: 0,
      angle: 0,
      color1: '#3498db',
      color2: '#2980b9',
      lastShot: 0,
      speed: PLAYER_SPEED,
      damage: 20,
      reloadSpeed: SHOOT_COOLDOWN,
      healthRegen: 0.05,
      upgrades: {
        damage: 0,
        bulletSpeed: 0,
        health: 0,
        regen: 0,
        reload: 0,
      },
      autofire: false,
    };

    socket.emit('init', { players, bots, coins, chests, projectiles });
    socket.broadcast.emit('newPlayer', players[socket.id]);
  });

  socket.on('playerMovement', (data) => {
    const player = players[socket.id];
    if (!player) return;

    // Clamp position inside map boundaries
    player.x = Math.max(player.size, Math.min(data.x, MAP_WIDTH - player.size));
    player.y = Math.max(player.size, Math.min(data.y, MAP_HEIGHT - player.size));
    player.angle = data.angle;

    io.emit('updatePlayers', players);
  });

  socket.on('shoot', () => {
    const player = players[socket.id];
    if (!player) return;

    const now = Date.now();
    if (now - player.lastShot < player.reloadSpeed) return;

    player.lastShot = now;

    const bulletOffset = player.size + 8;
    const bulletSpeed = PROJECTILE_SPEED + player.upgrades.bulletSpeed * 2;
    const projectile = {
      id: 'p' + projectileIdCounter++,
      x: player.x + Math.cos(player.angle) * bulletOffset,
      y: player.y + Math.sin(player.angle) * bulletOffset,
      angle: player.angle,
      speed: bulletSpeed,
      owner: socket.id,
      size: PROJECTILE_SIZE,
      damage: player.damage + player.upgrades.damage * 5,
    };

    projectiles[projectile.id] = projectile;
    io.emit('newProjectile', projectile);
  });

  socket.on('toggleAutofire', () => {
    const player = players[socket.id];
    if (player) player.autofire = !player.autofire;
  });

  socket.on('buyUpgrade', (type) => {
    const player = players[socket.id];
    if (!player) return;
    const costs = {
      damage: 15,
      bulletSpeed: 20,
      health: 25,
      regen: 30,
      reload: 20,
    };
    if (!costs[type]) return;
    if (player.coins >= costs[type]) {
      player.coins -= costs[type];
      player.upgrades[type]++;
      if (type === 'health') player.maxHealth += 10;
      if (type === 'regen') player.healthRegen += 0.02;
      if (type === 'reload') player.reloadSpeed = Math.max(50, player.reloadSpeed - 30);
      io.emit('updatePlayers', players);
    }
  });

  socket.on('collectCoin', (coinId) => {
    const player = players[socket.id];
    const coin = coins[coinId];
    if (!player || !coin) return;

    player.coins += coin.value;
    player.score += coin.value * 5;

    delete coins[coinId];
    io.emit('removeCoin', coinId);
    io.emit('updatePlayers', players);
  });

  socket.on('collectChest', (chestId) => {
    const player = players[socket.id];
    const chest = chests[chestId];
    if (!player || !chest) return;

    player.coins += chest.coins;
    player.score += chest.coins * 5;

    delete chests[chestId];
    io.emit('removeChest', chestId);
    io.emit('updatePlayers', players);
  });

  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    delete players[socket.id];
    io.emit('removePlayer', socket.id);
  });
});

// Game loop runs every 50ms (20 FPS)
setInterval(() => {
  // Move bots
  for (const id in bots) {
    const bot = bots[id];
    bot.x += Math.cos(bot.angle) * bot.speed;
    bot.y += Math.sin(bot.angle) * bot.speed;

    // Bounce off walls
    if (bot.x < bot.size || bot.x > MAP_WIDTH - bot.size) bot.angle = Math.PI - bot.angle;
    if (bot.y < bot.size || bot.y > MAP_HEIGHT - bot.size) bot.angle = -bot.angle;

    bot.sawAngle += 0.15; // rotate saw
    bot.health = Math.min(bot.health + 0.02, bot.maxHealth); // regen slowly
    bot.angle += (Math.random() - 0.5) * 0.2; // random wobble

    // Bot autofire nerfed (50% slower)
    const now = Date.now();
    if (now - bot.lastShot > bot.shootCooldown) {
      bot.lastShot = now;
      // Pick random player target
      const targetPlayers = Object.values(players);
      if (targetPlayers.length) {
        const target = targetPlayers[Math.floor(Math.random() * targetPlayers.length)];
        const angle = Math.atan2(target.y - bot.y, target.x - bot.x);
        const bulletOffset = bot.size + 8;
        const projectile = {
          id: 'p' + projectileIdCounter++,
          x: bot.x + Math.cos(angle) * bulletOffset,
          y: bot.y + Math.sin(angle) * bulletOffset,
          angle,
          speed: PROJECTILE_SPEED * 0.5, // nerfed speed
          owner: bot.id,
          size: PROJECTILE_SIZE,
          damage: 10,
        };
        projectiles[projectile.id] = projectile;
        io.emit('newProjectile', projectile);
      }
    }
  }

  // Move projectiles & collisions
  for (const id in projectiles) {
    const p = projectiles[id];
    p.x += Math.cos(p.angle) * p.speed;
    p.y += Math.sin(p.angle) * p.speed;

    // Remove projectile if out of bounds
    if (p.x < 0 || p.x > MAP_WIDTH || p.y < 0 || p.y > MAP_HEIGHT) {
      delete projectiles[id];
      io.emit('removeProjectile', id);
      continue;
    }

    // Check collisions with players and bots
    if (players[p.owner] && p.owner.startsWith('bot') === false) {
      // Projectiles shot by players
      for (const botId in bots) {
        const bot = bots[botId];
        const dist = Math.hypot(bot.x - p.x, bot.y - p.y);
        if (dist < bot.size + p.size) {
          bot.health -= p.damage;
          if (players[p.owner]) players[p.owner].score += 1;

          if (bot.health <= 0) {
            // Spawn coin on bot death
            const coin = createCoin(bot.x, bot.y, Math.floor(Math.random() * 3) + 1);
            coins[coin.id] = coin;
            io.emit('spawnCoin', coin);

            // Respawn bot
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
    } else if (p.owner.startsWith('bot')) {
      // Projectiles shot by bots hurt players
      for (const playerId in players) {
        const player = players[playerId];
        if (player.id === p.owner) continue; // bot can't hit self (just in case)
        const dist = Math.hypot(player.x - p.x, player.y - p.y);
        if (dist < player.size + p.size) {
          player.health -= p.damage;
          if (player.health <= 0) {
            player.health = player.maxHealth;
            player.x = Math.random() * (MAP_WIDTH - player.size * 2) + player.size;
            player.y = Math.random() * (MAP_HEIGHT - player.size * 2) + player.size;
            player.score = Math.max(0, player.score - 20);
            player.coins = Math.max(0, player.coins - 10);
          }
          delete projectiles[id];
          io.emit('removeProjectile', id);
          io.emit('updatePlayers', players);
          break;
        }
      }
    }
  }

  // Players autofire logic
  for (const playerId in players) {
    const player = players[playerId];
    if (player.autofire) {
      const now = Date.now();
      if (now - player.lastShot > player.reloadSpeed) {
        player.lastShot = now;
        const bulletOffset = player.size + 8;
        const bulletSpeed = PROJECTILE_SPEED + player.upgrades.bulletSpeed * 2;
        const projectile = {
          id: 'p' + projectileIdCounter++,
          x: player.x + Math.cos(player.angle) * bulletOffset,
          y: player.y + Math.sin(player.angle) * bulletOffset,
          angle: player.angle,
          speed: bulletSpeed,
          owner: player.id,
          size: PROJECTILE_SIZE,
          damage: player.damage + player.upgrades.damage * 5,
        };
        projectiles[projectile.id] = projectile;
        io.emit('newProjectile', projectile);
      }
    }

    // Regenerate health each tick
    player.health = Math.min(player.health + player.healthRegen, player.maxHealth);
  }

  // Check coin pickups
  for (const playerId in players) {
    const player = players[playerId];
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
  }

  // Check chest pickups
  for (const playerId in players) {
    const player = players[playerId];
    for (const chestId in chests) {
      const chest = chests[chestId];
      const dist = Math.hypot(player.x - chest.x, player.y - chest.y);
      if (dist < player.size + chest.size) {
        player.coins += chest.coins;
        player.score += chest.coins * 5;
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

}, 50);

// Leaderboard broadcast every second
setInterval(() => {
  broadcastLeaderboard();
}, 1000);

http.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
