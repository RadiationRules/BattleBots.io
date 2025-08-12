const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const PORT = process.env.PORT || 5000;

// Serve static files from 'public' folder
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

// Game state
const players = {};
const bots = {};
const projectiles = {};
const coins = {};

let botIdCounter = 1;
let projectileIdCounter = 1;
let coinIdCounter = 1;

// Generate random position inside map boundaries with padding
function randomPosition(size) {
  return {
    x: Math.random() * (MAP_WIDTH - size * 2) + size,
    y: Math.random() * (MAP_HEIGHT - size * 2) + size,
  };
}

// Create a bot object
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
    color1: '#f39c12',
    color2: '#e67e22',
  };
}

// Create coin object
function createCoin(x, y) {
  return {
    id: 'coin' + coinIdCounter++,
    x,
    y,
    size: COIN_SIZE,
    value: 1,
  };
}

// Spawn initial bots
for (let i = 0; i < 6; i++) {
  bots['bot' + i] = createBot();
}

// Broadcast leaderboard top 5 every second
function broadcastLeaderboard() {
  const topPlayers = Object.values(players)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(p => ({ id: p.id, score: p.score, coins: p.coins || 0 }));
  io.emit('leaderboard', topPlayers);
}

// On player connection
io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  // Initialize player on 'playerJoined' event
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
      color1: '#3498db',
      color2: '#2980b9',
      lastShot: 0,
      speed: PLAYER_SPEED,
      damage: 20,
    };

    socket.emit('init', { players, bots, coins, projectiles });
    socket.broadcast.emit('newPlayer', players[socket.id]);
  });

  // Movement update
  socket.on('playerMovement', (data) => {
    const player = players[socket.id];
    if (!player) return;

    // Clamp player position inside map
    player.x = Math.max(player.size, Math.min(data.x, MAP_WIDTH - player.size));
    player.y = Math.max(player.size, Math.min(data.y, MAP_HEIGHT - player.size));
    player.angle = data.angle;

    io.emit('updatePlayers', players);
  });

  // Shooting handler
  socket.on('shoot', () => {
    const player = players[socket.id];
    if (!player) return;

    const now = Date.now();
    if (now - player.lastShot < SHOOT_COOLDOWN) return;

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

  // Player disconnect
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    delete players[socket.id];
    io.emit('removePlayer', socket.id);
  });
});

// Game loop 20 times per second (every 50 ms)
setInterval(() => {
  // Move bots and update state
  for (const id in bots) {
    const bot = bots[id];
    bot.x += Math.cos(bot.angle) * bot.speed;
    bot.y += Math.sin(bot.angle) * bot.speed;

    // Bounce bots off walls
    if (bot.x < bot.size || bot.x > MAP_WIDTH - bot.size) bot.angle = Math.PI - bot.angle;
    if (bot.y < bot.size || bot.y > MAP_HEIGHT - bot.size) bot.angle = -bot.angle;

    bot.sawAngle += 0.15;
    bot.health = Math.min(bot.health + 0.02, bot.maxHealth);
    bot.angle += (Math.random() - 0.5) * 0.2;
  }

  // Move projectiles and check for collisions
  for (const id in projectiles) {
    const p = projectiles[id];
    p.x += Math.cos(p.angle) * p.speed;
    p.y += Math.sin(p.angle) * p.speed;

    // Remove projectiles outside map
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

  // Coin pickups
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

  // Emit updates every tick
  io.emit('updateBots', bots);
  io.emit('updateProjectiles', projectiles);
  io.emit('updateCoins', coins);

}, 50);

// Broadcast leaderboard every second
setInterval(() => {
  broadcastLeaderboard();
}, 1000);

// Start server
http.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
