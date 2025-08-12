const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const PORT = process.env.PORT || 5000;

app.use(express.static('public'));

// Game constants
const MAP_WIDTH = 900;
const MAP_HEIGHT = 700;
const PLAYER_SIZE = 30;
const BOT_SIZE = 30;
const COIN_SIZE = 12;
const PROJECTILE_SIZE = 6;
const PROJECTILE_SPEED = 12;
const PLAYER_SPEED = 4;
const BOT_SPEED = 2;
const SHOOT_COOLDOWN = 300; // ms

// Game state containers
const players = {};
const bots = {};
const projectiles = {};
const coins = {};

let botIdCounter = 1;
let projectileIdCounter = 1;
let coinIdCounter = 1;

// Utility function for random positions inside the map, with padding
function randomPosition(size) {
  return {
    x: Math.random() * (MAP_WIDTH - size * 2) + size,
    y: Math.random() * (MAP_HEIGHT - size * 2) + size,
  };
}

// Create a new AI bot object
function createBot() {
  const pos = randomPosition(BOT_SIZE);
  return {
    id: 'bot' + botIdCounter++,
    x: pos.x,
    y: pos.y,
    size: BOT_SIZE,
    health: 100,
    maxHealth: 100,
    speed: BOT_SPEED,
    angle: Math.random() * Math.PI * 2,
    sawAngle: 0,
    color1: '#f39c12', // bright orange
    color2: '#e67e22',
  };
}

// Create a coin at (x, y)
function createCoin(x, y) {
  return {
    id: 'coin' + coinIdCounter++,
    x,
    y,
    size: COIN_SIZE,
    value: 1,
  };
}

// Create initial bots
for (let i = 0; i < 6; i++) {
  bots['bot' + i] = createBot();
}

// Helper: broadcast leaderboard top 5 every second
function broadcastLeaderboard() {
  const topPlayers = Object.values(players)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(p => ({ id: p.id, score: p.score, coins: p.coins || 0 }));
  io.emit('leaderboard', topPlayers);
}

// Player connects
io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  // Wait for 'playerJoined' event to initialize player (after client ready)
  socket.on('playerJoined', () => {
    const pos = randomPosition(PLAYER_SIZE);
    players[socket.id] = {
      id: socket.id,
      x: pos.x,
      y: pos.y,
      size: PLAYER_SIZE,
      health: 100,
      maxHealth: 100,
      score: 0,
      coins: 0,
      angle: 0,
      color1: '#3498db', // bright blue
      color2: '#2980b9',
      lastShot: 0,
      speed: PLAYER_SPEED,
      damage: 20,
    };

    // Send initial game state to this player
    socket.emit('init', { players, bots, coins, projectiles });
    // Notify others of new player
    socket.broadcast.emit('newPlayer', players[socket.id]);
  });

  // Player movement update
  socket.on('playerMovement', (data) => {
    const player = players[socket.id];
    if (!player) return;

    // Clamp position inside map boundaries
    player.x = Math.max(player.size, Math.min(data.x, MAP_WIDTH - player.size));
    player.y = Math.max(player.size, Math.min(data.y, MAP_HEIGHT - player.size));
    player.angle = data.angle;

    io.emit('updatePlayers', players);
  });

  // Player shoots
  socket.on('shoot', () => {
    const player = players[socket.id];
    if (!player) return;

    const now = Date.now();
    if (now - player.lastShot < SHOOT_COOLDOWN) return; // enforce cooldown

    player.lastShot = now;

    const bulletOffset = player.size + 8;
    const projectile = {
      id: 'p' + projectileIdCounter++,
      x: player.x + Math.cos(player.angle) * bulletOffset,
      y: player.y + Math.sin(player.angle) * bulletOffset,
      angle: player.angle,
      speed: PROJECTILE_SPEED,
      owner: socket.id,
      size: PROJECTILE_SIZE,
      damage: player.damage,
    };

    projectiles[projectile.id] = projectile;
    io.emit('newProjectile', projectile);
  });

  // Player disconnects
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    delete players[socket.id];
    io.emit('removePlayer', socket.id);
  });
});

// Game main loop runs every 50ms (20 FPS)
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
  }

  // Move projectiles & check collisions
  for (const id in projectiles) {
    const p = projectiles[id];
    p.x += Math.cos(p.angle) * p.speed;
    p.y += Math.sin(p.angle) * p.speed;

    // Remove projectile if outside map
    if (p.x < 0 || p.x > MAP_WIDTH || p.y < 0 || p.y > MAP_HEIGHT) {
      delete projectiles[id];
      io.emit('removeProjectile', id);
      continue;
    }

    // Check collision with bots
    for (const botId in bots) {
      const bot = bots[botId];
      const dist = Math.hypot(bot.x - p.x, bot.y - p.y);

      if (dist < bot.size + p.size) {
        bot.health -= p.damage;

        if (players[p.owner]) players[p.owner].score += 1;

        // Bot died
        if (bot.health <= 0) {
          // Spawn coin at bot death position
          const coin = createCoin(bot.x, bot.y);
          coins[coin.id] = coin;
          io.emit('spawnCoin', coin);

          // Respawn bot
          bots[botId] = createBot();

          // Reward player coins and score
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

  // Broadcast updated bots & projectiles state every tick
  io.emit('updateBots', bots);
  io.emit('updateProjectiles', projectiles);
  io.emit('updateCoins', coins);

  // Broadcast leaderboard every second
}, 50);

// Leaderboard broadcast every 1 second
setInterval(() => {
  broadcastLeaderboard();
}, 1000);

// Start server
http.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
