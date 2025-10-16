// server.js
// Simple Node + Express + Socket.IO server for BattleBots.io demo.
// Usage: npm install express socket.io
//        node server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { /*cors: { origin: "*" }*/ });

const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname)); // serve index.html if requested

// game state
const players = {}; // socketId -> {id,x,y,angle,hp,name,kills,deaths,score,coins,lastSeen}
const bullets = []; // kept minimal on server; clients handle rendering
const leaderboard = [];

function updateLeaderboard(){
  const list = Object.values(players).sort((a,b)=> (b.score||0) - (a.score||0)).slice(0,8);
  // update global leaderboard snapshot
  return list.map(p => ({id:p.id, name:p.name, score:p.score||0}));
}

io.on('connection', socket => {
  console.log('conn', socket.id);

  // create a default player entry
  players[socket.id] = {
    id: socket.id,
    x: 400 + Math.random()*200,
    y: 200 + Math.random()*200,
    angle: 0,
    hp: 100,
    maxHp: 100,
    name: 'Player_'+socket.id.substr(0,4),
    kills: 0, deaths: 0, score: 0, coins: 0,
    lastSeen: Date.now()
  };

  // initial broadcast
  io.emit('state', { players, bullets, leaderboard: updateLeaderboard() });

  socket.on('disconnect', () => {
    console.log('disc', socket.id);
    delete players[socket.id];
    io.emit('state', { players, bullets, leaderboard: updateLeaderboard() });
  });

  socket.on('playerReady', (data) => {
    // store chosen bot or upgrades (persist minimal)
    if(players[socket.id]){
      players[socket.id].bot = data.bot;
      players[socket.id].upgrades = data.upgrades;
    }
  });

  socket.on('spawn', (data) => {
    if(players[socket.id]){
      players[socket.id].x = data.x||players[socket.id].x;
      players[socket.id].y = data.y||players[socket.id].y;
      players[socket.id].hp = players[socket.id].maxHp || 100;
      players[socket.id].lastSeen = Date.now();
    }
  });

  socket.on('input', (payload) => {
    if(players[socket.id]){
      players[socket.id].x = payload.x || players[socket.id].x;
      players[socket.id].y = payload.y || players[socket.id].y;
      players[socket.id].angle = payload.angle || players[socket.id].angle;
      players[socket.id].hp = payload.hp !== undefined ? payload.hp : players[socket.id].hp;
      players[socket.id].name = payload.name || players[socket.id].name;
      players[socket.id].lastSeen = Date.now();
    }
  });

  socket.on('shoot', (b) => {
    // server-register bullet minimally for collision checks
    const bullet = {
      id: b.id || ('s'+Date.now()+Math.random()),
      x: b.x, y: b.y, vx: b.vx, vy: b.vy, owner: socket.id, dmg: b.dmg || 8, created: Date.now()
    };
    bullets.push(bullet);
    // limit bullets length
    if(bullets.length > 500) bullets.shift();
  });

  socket.on('died', (payload) => {
    // payload: {victim, killer}
    const victim = players[payload.victim];
    const killer = players[payload.killer];
    if(victim) {
      victim.deaths = (victim.deaths||0) + 1;
      victim.hp = 0;
    }
    if(killer){
      killer.kills = (killer.kills||0) + 1;
      killer.score = (killer.score||0) + 10;
      killer.coins = (killer.coins||0) + 5;
      // notify everyone of kill event
      io.emit('event', {type:'killed', killer: killer.id, victim: victim ? victim.id : payload.victim, score: 10, coins: 5, xp: 20});
    }
  });

  socket.on('buyUpgrade', (payload) => {
    // optional server-side validation
    // in demo, we don't strictly validate
  });

  socket.on('pingCheck', (t) => {
    socket.emit('ping', Date.now() - t);
  });

});

// Server-side game loop (light): check bullet collisions with players
setInterval(()=> {
  // move bullets
  const now = Date.now();
  for(let i=bullets.length-1;i>=0;i--){
    const b = bullets[i];
    // integrate
    b.x += b.vx * 0.016 * 60; // normalized
    b.y += b.vy * 0.016 * 60;
    // expire old bullets
    if(now - b.created > 8000) { bullets.splice(i,1); continue; }
    // check collisions with players
    for(const id in players){
      const p = players[id];
      if(id === b.owner) continue; // no friendly fire for owner
      const dx = p.x - b.x, dy = p.y - b.y;
      const dist = Math.hypot(dx,dy);
      if(dist < 18){
        p.hp = (p.hp || 100) - (b.dmg || 8);
        if(p.hp <= 0){
          p.hp = 0;
          p.deaths = (p.deaths||0) + 1;
          // award killer
          const killer = players[b.owner];
          if(killer){
            killer.kills = (killer.kills||0) + 1;
            killer.score = (killer.score||0) + 10;
            killer.coins = (killer.coins||0) + 5;
            io.emit('event', {type:'killed', killer: killer.id, victim: p.id, score:10, coins:5, xp:20});
          } else {
            io.emit('event', {type:'killed', killer: null, victim: p.id});
          }
        }
        // remove bullet
        bullets.splice(i,1);
        break;
      }
    }
  }

  // expire inactive players
  const threshold = Date.now() - 1000*60*5;
  for(const id in players){
    if(players[id].lastSeen < threshold){ delete players[id]; }
  }

  // broadcast main state to clients
  io.emit('state', { players, bullets: bullets.slice(-100), leaderboard: updateLeaderboard() });

}, 1000/15);

server.listen(PORT, () => {
  console.log('Server listening on', PORT);
});
