const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const PORT = process.env.PORT || 5000;

// Serve public folder for frontend files
app.use(express.static('public'));

// --- Constants ---
const MAP_WIDTH = 1600;
const MAP_HEIGHT = 900;
const PLAYER_SIZE = 30;
const BOT_SIZE = 30;
const COIN_SIZE = 12;
const CHEST_SIZE = 20;
const PROJECTILE_SIZE = 6;

const PLAYER_BASE_SPEED = 4;
const BOT_BASE_SPEED = 2;
const SHOOT_COOLDOWN = 300; // ms

// --- Game State ---
const players = {};
const bots = {};
const projectiles = {};
const coins = {};
const chests = {};

let botIdCounter = 1;
let projectileIdCounter = 1;
let coinIdCounter = 1;
let chestIdCounter = 1;

const BOT_NAMES = [
  "Sliker", "Tung Sahur", "YourMom", "Zapster", "RoboRex",
  "PixelPunk", "NanoNinja", "CyberWolf", "BlastBot", "TurboTaco",
  "SteelShark", "MegaMunch", "BoltBiter", "Shockwave", "IronClaw"
];

// --- Utility functions ---
function randomPosition(size) {
  return {
    x: Math.random() * (MAP_WIDTH - size * 2) + size,
    y: Math.random() * (MAP_HEIGHT - size * 2) + size,
  };
}

function createBot() {
  const pos = randomPosition(BOT_SIZE);
  return {
    id: 'bot' + botIdCounter++,
    x: pos.x,
    y: pos.y,
    size: BOT_SIZE,
    health: 100,
    maxHealth: 100,
    speed: BOT_BASE_SPEED,
    angle: Math.random() * Math.PI * 2,
    sawAngle: 0,
    color1: '#f39c12',
    color2: '#e67e22',
    name: BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)],
    lastShot: 0,
    damage: 10,       // Nerfed damage (half player damage)
    projectileSpeed: 6,  // Nerfed projectile speed (half player speed)
  };
}

function createCoin(x, y, value = 1) {
  return {
    id: 'coin' + coinIdCounter++,
    x,
    y,
    size: COIN_SIZE,
    value,
  };
}

function createChest(x, y) {
  const coinAmount = Math.random() < 0.5 ? 10 : 25;
  return {
    id: 'chest' + chestIdCounter++,
    x,
    y,
    size: CHEST_SIZE,
    coins: coinAmount,
    opened: false,
  };
}

// Create initial bots
for (let i = 0; i < 10; i++) {
  bots['bot' + i] = createBot();
}

// --- Leaderboard helper ---
function broadcastLeaderboard() {
  const topPlayers = Object.values(players)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(p => ({ id: p.id, name: p.name, score: p.score, coins: p.coins || 0 }));
  io.emit('leaderboard', topPlayers);
}

// --- Socket.IO connection ---
io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  // Player join with name
  socket.on('playerJoined', (playerName) => {
    const pos = randomPosition(PLAYER_SIZE);
    players[socket.id] = {
      id: socket.id,
      name: playerName ? playerName.substring(0, 12) : "NoName",
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
      speed: PLAYER_BASE_SPEED,
      damage: 20,
      bulletSpeed: 12,
      reloadSpeed: SHOOT_COOLDOWN,
      regenRate: 0.05,
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

  // Movement update
  socket.on('playerMovement', (data) => {
    const player = players[socket.id];
    if (!player) return;

    player.x = Math.max(player.size, Math.min(data.x, MAP_WIDTH - player.size));
    player.y = Math.max(player.size, Math.min(data.y, MAP_HEIGHT - player.size));
    player.angle = data.angle;

    io.emit('updatePlayers', players);
  });

  // Shoot event
  socket.on('shoot', () => {
    const player = players[socket.id];
    if (!player) return;

    const now = Date.now();
    const cooldown = SHOOT_COOLDOWN - player.upgrades.reload * 30;
    if (now - player.lastShot < cooldown) return;

    player.lastShot = now;

    const bulletOffset = player.size + 8;
    const projectile = {
      id: 'p' + projectileIdCounter++,
      x: player.x + Math.cos(player.angle) * bulletOffset,
      y: player.y + Math.sin(player.angle) * bulletOffset,
      angle: player.angle,
      speed: player.bulletSpeed + player.upgrades.bulletSpeed * 1.5,
      owner: socket.id,
      size: PROJECTILE_SIZE,
      damage: player.damage + player.upgrades.damage * 5,
      isBotBullet: false,
    };

    projectiles[projectile.id] = projectile;
    io.emit('newProjectile', projectile);
  });

  // Toggle autofire (via 'E' key)
  socket.on('toggleAutofire', () => {
    const player = players[socket.id];
    if (!player) return;
    player.autofire = !player.autofire;
  });

  // Upgrade panel requests
  socket.on('buyUpgrade', (upgradeType) => {
    const player = players[socket.id];
    if (!player) return;

    // Upgrade costs scale: 5 coins per level + 10 base cost
    const currentLevel = player.upgrades[upgradeType];
    const cost = 10 + currentLevel * 5;

    if (player.coins >= cost && currentLevel < 10) {
      player.coins -= cost;
      player.upgrades[upgradeType]++;
      // Apply upgrade effects
      switch (upgradeType) {
        case 'damage':
          player.damage += 5;
          break;
        case 'bulletSpeed':
          player.bulletSpeed += 1.5;
          break;
        case 'health':
          player.maxHealth += 10;
          player.health = player.maxHealth;
          break;
        case 'regen':
          player.regenRate += 0.02;
          break;
        case 'reload':
          player.reloadSpeed = Math.max(50, SHOOT_COOLDOWN - player.upgrades.reload * 30);
          break;
      }
      io.emit('updatePlayers', players);
    }
  });

  // Player disconnects
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    delete players[socket.id];
    io.emit('removePlayer', socket.id);
  });
});

// --- Game Loop ---

setInterval(() => {
  // Move bots & shoot
  const now = Date.now();

  for (const id in bots) {
    const bot = bots[id];
    bot.x += Math.cos(bot.angle) * bot.speed;
    bot.y += Math.sin(bot.angle) * bot.speed;

    // Bounce off walls
    if (bot.x < bot.size || bot.x > MAP_WIDTH - bot.size) bot.angle = Math.PI - bot.angle;
    if (bot.y < bot.size || bot.y > MAP_HEIGHT - bot.size) bot.angle = -bot.angle;

    bot.sawAngle += 0.15;
    bot.health = Math.min(bot.health + 0.02, bot.maxHealth);
    bot.angle += (Math.random() - 0.5) * 0.2;

    // Bot shooting every 1.5 sec
    if (!bot.lastShot) bot.lastShot = 0;
    if (now - bot.lastShot > 1500) {
      bot.lastShot = now;

      // Target random player or shoot random direction
      const playerIds = Object.keys(players);
      let targetAngle = Math.random() * Math.PI * 2;
      if (playerIds.length > 0) {
        const targetPlayer = players[playerIds[Math.floor(Math.random() * playerIds.length)]];
        const dx = targetPlayer.x - bot.x;
        const dy = targetPlayer.y - bot.y;
        targetAngle = Math.atan2(dy, dx);
      }

      const bulletOffset = bot.size + 8;
      const projectile = {
        id: 'p' + projectileIdCounter++,
        x: bot.x + Math.cos(targetAngle) * bulletOffset,
        y: bot.y + Math.sin(targetAngle) * bulletOffset,
        angle: targetAngle,
        speed: bot.projectileSpeed,
        owner: bot.id,
        size: PROJECTILE_SIZE,
        damage: bot.damage,
        isBotBullet: true,
      };

      projectiles[projectile.id] = projectile;
      io.emit('newProjectile', projectile);
    }
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

    // Projectiles hit bots (except their owner)
    for (const botId in bots) {
      const bot = bots[botId];
      if (p.owner === botId) continue; // ignore self hits

      if (Math.hypot(bot.x - p.x, bot.y - p.y) < bot.size + p.size) {
        bot.health -= p.damage;

        if (!p.isBotBullet && players[p.owner]) players[p.owner].score++;
        if (bot.health <= 0) {
          // Spawn coins and chest sometimes
          const coin = createCoin(bot.x, bot.y);
          coins[coin.id] = coin;

          if (Math.random() < 0.2) {
            const chest = createChest(bot.x + 20, bot.y + 20);
            chests[chest.id] = chest;
            io.emit('spawnChest', chest);
          }

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

    // Projectiles hit players (except owner & bot bullets hit players)
    for (const playerId in players) {
      const player = players[playerId];
      if (playerId === p.owner) continue;
      if (p.isBotBullet && p.owner.startsWith("bot") === false) continue;

      if (Math.hypot(player.x - p.x, player.y - p.y) < player.size + p.size) {
        player.health -= p.damage;
        if (player.health <= 0) {
          player.health = player.maxHealth;
          player.x = Math.random() * (MAP_WIDTH - PLAYER_SIZE * 2) + PLAYER_SIZE;
          player.y = Math.random() * (MAP_HEIGHT - PLAYER_SIZE * 2) + PLAYER_SIZE;
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

  // Check coin pickups
  for (const playerId in players) {
    const player = players[playerId];
    for (const coinId in coins) {
      const coin = coins[coinId];
      if (Math.hypot(player.x - coin.x, player.y - coin.y) < player.size + coin.size) {
        player.coins += coin.value;
        player.score += coin.value * 5;
        io.emit('removeCoin', coin.id);
        delete coins[coinId];
        io.emit('updatePlayers', players);
      }
    }
    // Check chest pickup
    for (const chestId in chests) {
      const chest = chests[chestId];
      if (!chest.opened && Math.hypot(player.x - chest.x, player.y - chest.y) < player.size + chest.size) {
        chest.opened = true;
        player.coins += chest.coins;
        player.score += chest.coins * 10;
        io.emit('updateChest', chest);
        io.emit('updatePlayers', players);
      }
    }

    // Regenerate health slowly
    player.health = Math.min(player.health + player.regenRate, player.maxHealth);
  }

  io.emit('updateBots', bots);
  io.emit('updateProjectiles', projectiles);
  io.emit('updateCoins', coins);
  io.emit('updateChests', chests);

}, 50); // 20 FPS

// Leaderboard broadcast every 1 second
setInterval(() => {
  broadcastLeaderboard();
}, 1000);

// Start server
http.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
