import type { AgeBand } from "./age";

function baseDoc(title: string, bodyInner: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title}</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    font-family: system-ui, "Segoe UI", Roboto, "PingFang SC", sans-serif;
    background: linear-gradient(145deg, #e0f2fe 0%, #fef3c7 50%, #fce7f3 100%);
    color: #0f172a;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }
  .card {
    background: rgba(255,255,255,.92);
    border-radius: 20px;
    padding: 20px 22px;
    max-width: 420px;
    width: 100%;
    box-shadow: 0 12px 40px rgba(15,23,42,.12);
  }
  h1 { font-size: 1.25rem; margin: 0 0 8px; }
  p { margin: 0 0 12px; line-height: 1.55; font-size: 0.95rem; color: #334155; }
  .tag {
    display: inline-block;
    font-size: 0.75rem;
    padding: 4px 10px;
    border-radius: 999px;
    background: #e0f2fe;
    color: #0369a1;
    margin-bottom: 10px;
  }
  button {
    border: 0;
    border-radius: 12px;
    padding: 10px 16px;
    font-size: 0.95rem;
    cursor: pointer;
    background: linear-gradient(90deg, #38bdf8, #a78bfa);
    color: #fff;
    font-weight: 600;
  }
  button:active { transform: scale(0.98); }
  canvas { border-radius: 12px; background: #0f172a; display: block; margin: 0 auto; }
</style>
</head>
<body>
${bodyInner}
</body>
</html>`;
}

function pickKind(prompt: string): "game" | "story" | "generic" {
  const p = prompt.toLowerCase();
  if (/游戏|球|接|打|跳|跑|分|关|玩/.test(p)) return "game";
  if (/故事|书|剧情|童话|冒险|角色/.test(p)) return "story";
  return "generic";
}

export function getDemoHtml(prompt: string, age: AgeBand): string {
  const kind = pickKind(prompt);
  const hint =
    age === "primary"
      ? "这是离线演示作品。让家长帮你在 .env.local 里配置 OPENROUTER_API_KEY 后，就能经 OpenRouter 按你的想法生成新页面。"
      : "当前为演示模式（未配置 OPENROUTER_API_KEY）。在 .env.local 中配置后可经 OpenRouter 使用 AI 按描述生成完整作品。";

  if (kind === "game") {
    return baseDoc(
      "接球小游戏",
      `<div class="card">
  <span class="tag">演示 · 小游戏</span>
  <h1>接球挑战</h1>
  <p>${hint}</p>
  <p>你的想法：<strong>${escapeHtml(prompt)}</strong></p>
  <canvas id="c" width="320" height="240"></canvas>
  <p style="text-align:center;margin-top:10px;font-size:0.9rem;">用 ← → 移动托盘接球</p>
</div>
<script>
(function(){
  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d');
  var w = canvas.width, h = canvas.height;
  var paddle = { x: w/2-40, y: h-18, w: 80, h: 10, speed: 6 };
  var ball = { x: w/2, y: 40, r: 8, vx: 2.2, vy: 3 };
  var score = 0;
  var keys = {};
  document.addEventListener('keydown', function(e){ keys[e.key] = true; });
  document.addEventListener('keyup', function(e){ keys[e.key] = false; });
  function loop() {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0,0,w,h);
    if (keys['ArrowLeft']) paddle.x = Math.max(0, paddle.x - paddle.speed);
    if (keys['ArrowRight']) paddle.x = Math.min(w - paddle.w, paddle.x + paddle.speed);
    ball.x += ball.vx; ball.y += ball.vy;
    if (ball.x < ball.r || ball.x > w - ball.r) ball.vx *= -1;
    if (ball.y < ball.r) ball.vy *= -1;
    if (ball.y > h - ball.r) {
      if (ball.x > paddle.x && ball.x < paddle.x + paddle.w) {
        ball.vy = -Math.abs(ball.vy) - 0.05;
        score++;
        ball.vx += (Math.random() - 0.5) * 0.5;
      } else {
        ball.x = w/2; ball.y = 40; ball.vx = 2; ball.vy = 3; score = Math.max(0, score-1);
      }
    }
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(paddle.x, paddle.y, paddle.w, paddle.h);
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI*2);
    ctx.fillStyle = '#fbbf24';
    ctx.fill();
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '14px system-ui';
    ctx.fillText('得分: ' + score, 10, 22);
    requestAnimationFrame(loop);
  }
  loop();
})();
</script>`,
    );
  }

  if (kind === "story") {
    const lines = [
      "你在一片发光的森林里发现了一扇门。",
      "门后传来轻柔的音乐声。",
      "你推开门——原来是一个属于你的小舞台！",
    ];
    return baseDoc(
      "互动小故事",
      `<div class="card">
  <span class="tag">演示 · 互动故事</span>
  <h1 id="t">开场</h1>
  <p id="d">${lines[0]}</p>
  <p style="font-size:0.85rem;color:#64748b;">${hint}</p>
  <p>你的主题：<strong>${escapeHtml(prompt)}</strong></p>
  <button type="button" id="n">下一段</button>
</div>
<script>
(function(){
  var lines = ${JSON.stringify(lines)};
  var titles = ['开场','发展','结尾'];
  var i = 0;
  var btn = document.getElementById('n');
  btn.addEventListener('click', function(){
    i = (i + 1) % lines.length;
    document.getElementById('t').textContent = titles[i];
    document.getElementById('d').textContent = lines[i];
  });
})();
</script>`,
    );
  }

  return baseDoc(
    "创意小作品",
    `<div class="card">
  <span class="tag">演示 · 通用</span>
  <h1>你的想法，会发光</h1>
  <p>${hint}</p>
  <p>当前描述：<strong>${escapeHtml(prompt)}</strong></p>
  <canvas id="cv" width="320" height="200"></canvas>
  <p style="text-align:center;margin-top:10px;font-size:0.9rem;">星星会跟着你的鼠标轻轻晃动</p>
</div>
<script>
(function(){
  var c = document.getElementById('cv');
  var ctx = c.getContext('2d');
  var stars = [];
  for (var i=0;i<48;i++) stars.push({ x: Math.random()*320, y: Math.random()*200, s: Math.random()*2+0.5 });
  var mx = 160, my = 100;
  c.addEventListener('mousemove', function(e){
    var r = c.getBoundingClientRect();
    mx = e.clientX - r.left; my = e.clientY - r.top;
  });
  function loop(){
    ctx.clearRect(0,0,320,200);
    var g = ctx.createLinearGradient(0,0,320,200);
    g.addColorStop(0,'#0f172a'); g.addColorStop(1,'#1e293b');
    ctx.fillStyle = g; ctx.fillRect(0,0,320,200);
    stars.forEach(function(st){
      var dx = (mx - st.x) * 0.02, dy = (my - st.y) * 0.02;
      st.x += dx; st.y += dy;
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.beginPath(); ctx.arc(st.x, st.y, st.s, 0, Math.PI*2); ctx.fill();
    });
    requestAnimationFrame(loop);
  }
  loop();
})();
</script>`,
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function welcomeHtml(): string {
  return baseDoc(
    "欢迎",
    `<div class="card">
  <span class="tag">就绪</span>
  <h1>先说说你想做什么</h1>
  <p>可以点下面的快捷词，也可以自己输入一整段想法——游戏、故事、网页小工具都可以试试。</p>
  <p style="font-size:0.9rem;color:#64748b;">生成后，结果会出现在右侧预览里。</p>
</div>`,
  );
}
