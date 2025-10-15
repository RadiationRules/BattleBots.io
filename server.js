const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let players = {};
let bullets = [];
let bots = {};

const tankTypes = {
  Tank: { speed: 3, health: 120, damage: 12, color:'#0ff' },
  Rammer: { speed: 5, health: 80, damage: 8, color:'#f0f' },
  Sniper: { speed: 2.5, health: 90, damage: 25, color:'#ff0' }
};

function spawnBots() {
  for(let i=0;i<6;i++){
    bots['bot'+i] = {id:'bot'+i, x:Math.random()*800+100, y:Math.random()*600+100, health:100, color:'#f00'};
  }
}
spawnBots();

setInterval(()=>{
  // Move bullets & check collisions
  bullets.forEach((b,i)=>{
    b.x += b.vx;
    b.y += b.vy;
    for(const id in players){
      const p = players[id];
      if(Math.hypot(b.x-p.x,b.y-p.y)<20){
        p.health -= b.damage;
        if(p.health <= 0) { p.health=0; p.score=0; }
        bullets.splice(i,1); break;
      }
    }
  });

  // Bot AI
  for(const id in bots){
    const b = bots[id];
    let nearest=null, dist=Infinity;
    for(const pid in players){
      const p = players[pid];
      const d = Math.hypot(p.x-b.x,p.y-b.y);
      if(d<dist){dist=d; nearest=p;}
    }
    if(nearest){
      const dx = nearest.x-b.x;
      const dy = nearest.y-b.y;
      const len = Math.hypot(dx,dy);
      b.x += (dx/len)*1.2;
      b.y += (dy/len)*1.2;
    }
  }

  io.emit('currentState',{players,bots,bullets});
},1000/60);

io.on('connection',socket=>{
  socket.on('joinGame',data=>{
    players[socket.id] = {
      id: socket.id,
      x: 400+Math.random()*200,
      y: 300+Math.random()*200,
      type: data.tankType,
      health: tankTypes[data.tankType].health,
      color: tankTypes[data.tankType].color,
      ammo:100,
      score:0
    };
  });

  socket.on('move',data=>{
    const p = players[socket.id]; if(!p) return;
    const speed = tankTypes[p.type].speed;
    p.x += data.dx*speed;
    p.y += data.dy*speed;
    io.emit('playerMove',{id:socket.id,x:p.x,y:p.y});
  });

  socket.on('shoot',data=>{
    const p = players[socket.id]; if(!p) return;
    const angle = data.angle;
    bullets.push({x:p.x,y:p.y,vx:Math.cos(angle)*12,vy:Math.sin(angle)*12,damage:tankTypes[p.type].damage});
  });

  socket.on('disconnect',()=>{ delete players[socket.id]; io.emit('playerLeft',socket.id); });
});

server.listen(3000,()=>console.log('Server running on port 3000'));
