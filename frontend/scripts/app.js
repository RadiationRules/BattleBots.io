const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const socket = io();
let myId = null, myPlayer = null, players = [], bullets = [], bots = [], leaderboard = [], camera = { x: 0, y: 0 }, health = 100, score = 0, cooldown = 0, ammo = 10, particles = [], keys = {}, mouseAngle = 0;
function lerp(a, b, t) { return a + (b - a) * t; }
function neonGlow(color, blur = 16) { ctx.shadowColor = color; ctx.shadowBlur = blur; }
function clearGlow() { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; }
socket.on('connect', () => { myId = socket.id; });
socket.on('gameState', state => {
    players = state.players || [];
    bullets = state.bullets || [];
    bots = state.bots || [];
    leaderboard = state.leaderboard || [];
    myPlayer = players.find(p=>p.id===myId);
    if (myPlayer) {
        camera.x = lerp(camera.x, myPlayer.x, 0.2);
        camera.y = lerp(camera.y, myPlayer.y, 0.2);
        health = myPlayer.health;
        score = myPlayer.score;
        cooldown = myPlayer.cooldown;
    }
});
window.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
canvas.addEventListener('mousemove', e => {
    if (!myPlayer) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    mouseAngle = Math.atan2(my-canvas.height/2, mx-canvas.width/2);
    socket.emit('aim', mouseAngle);
});
canvas.addEventListener('mousedown', e => {
    if (cooldown<=0) {
        socket.emit('shoot');
        ammo = Math.max(0, ammo-1);
    }
});
window.addEventListener('keypress', e => {
    if (e.code==='Space') socket.emit('ability');
});
function updateParticles() {
    particles = particles.filter(p=>p.life>0);
    particles.forEach(p=>{
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
    });
}
function update() {
    if (myPlayer) {
        if (keys['w']) socket.emit('move','up');
        if (keys['s']) socket.emit('move','down');
        if (keys['a']) socket.emit('move','left');
        if (keys['d']) socket.emit('move','right');
    }
    updateParticles();
}
function render() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.save();
    ctx.translate(canvas.width/2-camera.x, canvas.height/2-camera.y);
    ctx.fillStyle='#181828';
    ctx.fillRect(-1200,-1200,2400,2400);
    neonGlow('#0ff',40);
    ctx.strokeStyle='#0ff';
    ctx.lineWidth=8;
    ctx.strokeRect(-1000,-1000,2000,2000);
    clearGlow();
    bullets.forEach(bullet => {
        ctx.save();
        ctx.translate(bullet.x, bullet.y);
        neonGlow('#0ff',12);
        ctx.rotate(bullet.angle);
        ctx.fillStyle='#0ff';
        ctx.globalAlpha=0.8;
        ctx.fillRect(-4,-2,16,4);
        ctx.globalAlpha=1;
        clearGlow();
        ctx.beginPath();
        ctx.moveTo(0,0);
        ctx.lineTo(-16,0);
        ctx.strokeStyle='#0ff8';
        ctx.lineWidth=2;
        ctx.stroke();
        ctx.restore();
    });
    particles.forEach(p=>{
        ctx.save();
        ctx.globalAlpha = p.life/30;
        neonGlow(p.color,8);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, 2*Math.PI);
        ctx.fillStyle = p.color;
        ctx.fill();
        clearGlow();
        ctx.restore();
    });
    [...players,...bots].forEach(tank => {
        ctx.save();
        ctx.translate(tank.x, tank.y);
        neonGlow('#0ff',16);
        if (tank.type==='tank') {
            ctx.fillStyle='#222'; ctx.beginPath(); ctx.arc(0,0,22,0,2*Math.PI); ctx.fill();
            ctx.strokeStyle='#0ff'; ctx.lineWidth=5; ctx.stroke();
            if (tank.shield) {
                neonGlow('#0ff',32);
                ctx.beginPath(); ctx.arc(0,0,28,0,2*Math.PI); ctx.strokeStyle='#0ff'; ctx.lineWidth=6; ctx.stroke();
            }
            ctx.fillStyle='#0ff'; ctx.fillRect(-8,-28,16,16);
        } else if (tank.type==='rammer') {
            ctx.fillStyle='#222'; ctx.beginPath(); ctx.ellipse(0,0,16,26,0,0,2*Math.PI); ctx.fill();
            ctx.strokeStyle='#0ff'; ctx.lineWidth=5; ctx.stroke();
            ctx.fillStyle='#0ff'; ctx.fillRect(-6,-32,12,18);
        } else if (tank.type==='sniper') {
            ctx.fillStyle='#222'; ctx.beginPath(); ctx.arc(0,0,18,0,2*Math.PI); ctx.fill();
            ctx.strokeStyle='#0ff'; ctx.lineWidth=5; ctx.stroke();
            ctx.fillStyle='#0ff'; ctx.fillRect(-4,-28,8,24);
        }
        ctx.rotate(tank.angle);
        neonGlow('#0ff',8);
        ctx.fillStyle='#0ff';
        ctx.fillRect(-4,-28,8,24);
        clearGlow();
        ctx.restore();
        ctx.save();
        ctx.translate(tank.x, tank.y-38);
        ctx.font='bold 18px Arial';
        ctx.textAlign='center';
        ctx.textBaseline='bottom';
        neonGlow('#0ff',8);
        ctx.fillStyle='#fff';
        ctx.fillText(tank.name,0,0);
        clearGlow();
        ctx.translate(0,8);
        let hp = Math.max(0,tank.health)/100;
        ctx.fillStyle='#222'; ctx.fillRect(-32,0,64,10);
        let grad = ctx.createLinearGradient(-32,0,32,0);
        grad.addColorStop(0,'#f00'); grad.addColorStop(0.5,'#ff0'); grad.addColorStop(1,'#0f0');
        ctx.fillStyle=grad; ctx.fillRect(-32,0,64*hp,10);
        ctx.strokeStyle='#0ff'; ctx.lineWidth=2; ctx.strokeRect(-32,0,64,10);
        ctx.restore();
    });
    ctx.restore();
    ctx.save();
    ctx.font = 'bold 24px Arial';
    ctx.fillStyle = '#fff';
    neonGlow('#0ff',8);
    ctx.fillText(`Health: ${Math.round(health)}`, 32, 48);
    ctx.fillText(`Ammo: ${ammo}`, 32, 80);
    ctx.fillText(`Cooldown: ${(cooldown/30).toFixed(1)}s`, 32, 112);
    ctx.fillText(`Score: ${score}`, 32, 144);
    clearGlow();
    ctx.save();
    ctx.translate(canvas.width-260, 40);
    ctx.fillStyle = 'rgba(20,30,40,0.7)';
    ctx.strokeStyle = '#0ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.rect(0,0,220,leaderboard.length*32+40);
    ctx.fill();
    ctx.stroke();
    ctx.font = 'bold 20px Arial';
    ctx.fillStyle = '#0ff';
    ctx.fillText('Leaderboard', 16, 32);
    ctx.font = 'bold 18px Arial';
    leaderboard.forEach((e,i)=>{
        ctx.fillStyle = '#fff';
        ctx.fillText(`${e.name}: ${e.score}`, 16, 64+i*28);
    });
    ctx.restore();
    ctx.restore();
}
socket.on('gameState', state => {
    state.players.concat(state.bots).forEach(tank=>{
        if (tank.health<=0) {
            for (let i=0;i<24;i++) {
                particles.push({
                    x:tank.x,y:tank.y,
                    vx:Math.cos(i/24*2*Math.PI)*Math.random()*8,
                    vy:Math.sin(i/24*2*Math.PI)*Math.random()*8,
                    life:30+Math.random()*20,
                    size:6+Math.random()*4,
                    color:'#0ff'
                });
            }
        }
    });
    state.bullets.forEach(b=>{
        if (b.life<5) {
            for (let i=0;i<8;i++) {
                particles.push({
                    x:b.x,y:b.y,
                    vx:Math.cos(i/8*2*Math.PI)*Math.random()*4,
                    vy:Math.sin(i/8*2*Math.PI)*Math.random()*4,
                    life:18+Math.random()*8,
                    size:3+Math.random()*2,
                    color:'#0ff'
                });
            }
        }
    });
});
function init() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    requestAnimationFrame(gameLoop);
}
function gameLoop() {
    update();
    render();
    requestAnimationFrame(gameLoop);
}
window.onload = init;
window.addEventListener('resize',()=>{
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});
