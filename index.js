// index.js - Server

const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const PORT = process.env.PORT || 5000;

// Serve client files
app.use(express.static('public'));

// Constants
const MAP_WIDTH = 1600;
const MAP_HEIGHT = 900;
const PLAYER_SIZE = 32;
const BOT_SIZE = 32;
const COIN_SIZE = 14;
const PROJECTILE_SIZE = 8;
const PROJECTILE_SPEED = 14;
const PLAYER_SPEED = 5;
const BOT_SPEED = 2.5;
const SHOOT_COOLDOWN = 250;

// Game state
const players = {};
const bots = {};
const projectiles = {};
const coins = {};

let botIdCounter = 1;
let projectileIdCounter = 1;
let coinIdCounter = 1;

// Game modes data
const gameModes = ['Free For All', 'Team Deathmatch'];
let currentGameMode = 'Free For All';

// Helper to generate random position in map
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
    speed: BOT_SPEED,
    angle: Math.random() * Math.PI * 2,
    sawAngle: 0,
    color1: '#f39c12',
    color2: '#e67e22',
    name: randomBotName(),
    team: null,
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

function randomBotName() {
  const names = ['Sliker', 'Tung Sahur', 'YourMom', 'AlphaBot', 'MechaX', 'RoboKing', 'SteelWolf', 'BlastCore'];
  return names[Math.floor(Math.random() * names.length)];
}

// Spawn initial bots
for (let i = 0; i < 10; i++) {
  bots['bot' + i] = createBot();
}

// Broadcast leaderboard top players
function broadcastLeaderboard() {
  const topPlayers = Object.values(players)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(p => ({
      id: p.id,
      name: p.name,
      score: p.score,
      coins: p.coins || 0,
      team: p.team || null,
    }));
  io.emit('leaderboard', topPlayers);
}

// Socket connection
io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  socket.on('selectGameMode', (mode) => {
    if (gameModes.includes(mode)) currentGameMode = mode;
    // Could reset game state here if needed
  });

  socket.on('playerJoined', (data) => {
    // Data contains player name and chosen team if team mode
    const pos = randomPosition(PLAYER_SIZE);
    players[socket.id] = {
      id: socket.id,
      name: data?.name || 'Player',
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
      team: currentGameMode === 'Team Deathmatch' ? data?.team || 'red' : null,
      autoFire: false,
    };

    // Send initial game state
    socket.emit('init', { players, bots, coins, projectiles, gameMode: currentGameMode, gameModes });

    // Notify others
    socket.broadcast.emit('newPlayer', players[socket.id]);
  });

  socket.on('playerMovement', (data) => {
    const player = players[socket.id];
    if (!player) return;

    // Clamp position inside map
    player.x = Math.max(player.size, Math.min(data.x, MAP_WIDTH - player.size));
    player.y = Math.max(player.size, Math.min(data.y, MAP_HEIGHT - player.size));
    player.angle = data.angle;

    io.emit('updatePlayers', players);
  });

  socket.on('shoot', () => {
    const player = players[socket.id];
    if (!player) return;

    const now = Date.now();
    if (now - player.lastShot < SHOOT_COOLDOWN) return; // cooldown

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

  socket.on('toggleAutoFire', (enabled) => {
    if (players[socket.id]) {
      players[socket.id].autoFire = enabled;
    }
  });

  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    delete players[socket.id];
    io.emit('removePlayer', socket.id);
  });
});

// Game main loop 50ms (20 FPS)
setInterval(() => {
  // Move bots with AI
  for (const id in bots) {
    const bot = bots[id];
    bot.x += Math.cos(bot.angle) * bot.speed;
    bot.y += Math.sin(bot.angle) * bot.speed;

    // Bounce off map edges
    if (bot.x < bot.size || bot.x > MAP_WIDTH - bot.size) bot.angle = Math.PI - bot.angle;
    if (bot.y < bot.size || bot.y > MAP_HEIGHT - bot.size) bot.angle = -bot.angle;

    bot.sawAngle += 0.15;
    bot.health = Math.min(bot.health + 0.02, bot.maxHealth);
    bot.angle += (Math.random() - 0.5) * 0.2;

    // Bots shoot with nerfed damage & rate
    if (Math.random() < 0.01) { // 1% chance every tick
      const projectile = {
        id: 'p' + projectileIdCounter++,
        x: bot.x + Math.cos(bot.angle) * (bot.size + 8),
        y: bot.y + Math.sin(bot.angle) * (bot.size + 8),
        angle: bot.angle,
        speed: PROJECTILE_SPEED,
        owner: bot.id,
        size: PROJECTILE_SIZE,
        damage: 10, // nerfed damage 50%
      };
      projectiles[projectile.id] = projectile;
      io.emit('newProjectile', projectile);
    }
  }

  // Move projectiles and check collisions
  for (const id in projectiles) {
    const p = projectiles[id];
    p.x += Math.cos(p.angle) * p.speed;
    p.y += Math.sin(p.angle) * p.speed;

    // Remove if out of map
    if (p.x < 0 || p.x > MAP_WIDTH || p.y < 0 || p.y > MAP_HEIGHT) {
      delete projectiles[id];
      io.emit('removeProjectile', id);
      continue;
    }

    // Check collision with players and bots (different in modes)
    if (p.owner.startsWith('bot')) {
      // Projectile from bot - can hit players
      for (const playerId in players) {
        const player = players[playerId];
        const dist = Math.hypot(player.x - p.x, player.y - p.y);
        if (dist < player.size + p.size && player.health > 0) {
          player.health -= p.damage;
          if (player.health <= 0) {
            player.health = 0;
            players[p.owner]?.score += 10;
            // Respawn player later or handle death logic here
          }
          delete projectiles[id];
          io.emit('removeProjectile', id);
          io.emit('updatePlayers', players);
          break;
        }
      }
    } else {
      // Projectile from player - can hit bots and other players (depending on mode)
      let hit = false;

      // Hit bots
      for (const botId in bots) {
        const bot = bots[botId];
        const dist = Math.hypot(bot.x - p.x, bot.y - p.y);
        if (dist < bot.size + p.size) {
          bot.health -= p.damage;
          if (players[p.owner]) players[p.owner].score += 1;

          if (bot.health <= 0) {
            // Spawn coin chest with random value 10 or 25
            const coinValue = Math.random() < 0.7 ? 10 : 25;
            const coin = createCoin(bot.x, bot.y, coinValue);
            coins[coin.id] = coin;
            io.emit('spawnCoin', coin);

            bots[botId] = createBot();

            if (players[p.owner]) {
              players[p.owner].score += 10;
              players[p.owner].coins += coin.value;
            }
          }

          hit = true;
          break;
        }
      }

      // Could add friendly fire / PvP here depending on gameMode

      if (hit) {
        delete projectiles[id];
        io.emit('removeProjectile', id);
        io.emit('updateBots', bots);
        io.emit('updatePlayers', players);
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

  io.emit('updateBots', bots);
  io.emit('updateProjectiles', projectiles);
  io.emit('updateCoins', coins);
}, 50);

// Broadcast leaderboard every second
setInterval(() => {
  broadcastLeaderboard();
}, 1000);

http.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
