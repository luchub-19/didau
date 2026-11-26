// CDP tối thiểu cho T-128: chụp phần #tie, đo long task khi kéo, đếm WebGL context. Node ≥ 22 (WebSocket toàn cục).
// node cdp.mjs <chromePort> <baseUrl> <outDir> <mode: shots|drag|gif>
import fs from 'node:fs';
import path from 'node:path';

const [port, base, outDir, mode = 'shots'] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openTab() {
  const t = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0;
  const waiting = new Map();
  const listeners = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && waiting.has(msg.id)) {
      const { res, rej } = waiting.get(msg.id);
      waiting.delete(msg.id);
      if (msg.error) rej(new Error(JSON.stringify(msg.error)));
      else res(msg.result);
    } else if (msg.method) listeners.forEach((l) => l(msg));
  });
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      id += 1;
      waiting.set(id, { res, rej });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  return { send, evaluate, on: (l) => listeners.push(l), close: () => ws.close(), targetId: t.id };
}

const PROBE = `(() => {
  window.__gl = [];
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const ctx = orig.call(this, type, ...rest);
    if (ctx && /webgl/.test(type) && !window.__gl.some((g) => g.ctx === ctx)) window.__gl.push({ canvas: this, ctx });
    return ctx;
  };
  window.__long = [];
  try {
    new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push({ t: e.startTime, d: e.duration }))).observe({ type: 'longtask', buffered: true });
  } catch {}
})();`;

async function load(tab, { width, height, lang, touch }) {
  await tab.send('Page.enable');
  await tab.send('Runtime.enable');
  await tab.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 500 });
  if (touch) await tab.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await tab.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `try { localStorage.setItem('didau.lang', '${lang}'); } catch {} ${PROBE}`,
  });
  await tab.send('Page.navigate', { url: base });
  await sleep(2500);
  // Cuộn từng đoạn tới #tie để IO của các phần chạy như người thật
  await tab.evaluate(`(async () => { const y = document.getElementById('tie').getBoundingClientRect().top + scrollY; for (let s = scrollY; s < y; s += 600) { scrollTo(0, s); await new Promise(r => setTimeout(r, 60)); } document.getElementById('tie').scrollIntoView(); })()`);
  const t0 = Date.now();
  let phase = '';
  while (Date.now() - t0 < 25000) {
    phase = await tab.evaluate(`document.querySelector('.tie-map-card')?.dataset.phase`);
    if (phase === 'live' || phase === 'failed') break;
    await sleep(300);
  }
  await sleep(3500); // ô bản đồ
  return phase;
}

async function shot(tab, file, selector = '#tie') {
  const r = await tab.evaluate(`(() => { const b = document.querySelector('${selector}').getBoundingClientRect(); return { x: b.left + scrollX, y: b.top + scrollY, w: b.width, h: b.height }; })()`);
  const { data } = await tab.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
    clip: { x: r.x, y: r.y, width: r.w, height: r.h, scale: 1 },
  });
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
}

const glAlive = (tab) =>
  tab.evaluate(`window.__gl.map((g) => ({ lost: g.ctx.isContextLost(), connected: g.canvas.isConnected, cls: g.canvas.className }))`);

async function shots() {
  const report = [];
  for (const width of [1440, 390]) {
    for (const lang of ['vi', 'en']) {
      const tab = await openTab();
      const phase = await load(tab, { width, height: width > 500 ? 1300 : 2300, lang, touch: width < 500 });
      const pre = `T-128-${width}-${lang}`;
      await shot(tab, path.join(outDir, `${pre}-empty.png`));
      await tab.evaluate(`document.querySelector('[data-area="gv"]').click()`);
      await sleep(1300);
      await shot(tab, path.join(outDir, `${pre}-gv.png`));
      await tab.evaluate(`document.querySelector('[data-area="btn"]').click()`);
      await sleep(1300);
      await shot(tab, path.join(outDir, `${pre}-btn.png`));
      const info = await tab.evaluate(`({ overflow: document.documentElement.scrollWidth - innerWidth, verdict: document.querySelector('.tie-verdict').innerText, note: document.querySelector('.tie-board-note').innerText, card: document.querySelector('.tie-map-card').getBoundingClientRect().height })`);
      report.push({ width, lang, phase, gl: await glAlive(tab), ...info });
      await tab.send('Target.closeTarget', { targetId: tab.targetId }).catch(() => {});
      tab.close();
    }
  }
  console.log(JSON.stringify(report, null, 2));
}

async function pinCenter(tab) {
  return tab.evaluate(`(() => { const b = document.querySelector('.tie-you img').getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; })()`);
}

async function drag({ gif }) {
  const tab = await openTab();
  const phase = await load(tab, { width: 1440, height: 1300, lang: 'vi' });
  await tab.evaluate(`document.querySelector('[data-area="q3"]').click()`);
  await sleep(1200);
  const [x0, y0] = await pinCenter(tab);
  const card = await tab.evaluate(`(() => { const b = document.querySelector('.tie-map-card').getBoundingClientRect(); return [b.left, b.top, b.width, b.height, scrollX, scrollY]; })()`);
  await tab.evaluate(`(() => { window.__long = window.__long.filter(() => false); window.__frames = []; let last = performance.now(); const f = (t) => { window.__frames.push(t - last); last = t; if (!window.__stop) requestAnimationFrame(f); }; requestAnimationFrame(f); window.__dragStart = performance.now(); })()`);
  await tab.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y: y0, button: 'left', buttons: 1, clickCount: 1 });
  const frames = [];
  const dur = 5000;
  const t0 = Date.now();
  let i = 0;
  // Đường kéo: vòng elip quanh giữa bản đồ (đi qua nhiều quận, đổi đề xuất vài lần)
  const cx = card[0] + card[2] * 0.45;
  const cy = card[1] + card[3] * 0.55;
  const rx = card[2] * 0.33;
  const ry = card[3] * 0.25;
  while (Date.now() - t0 < dur) {
    const k = (Date.now() - t0) / dur;
    const a = k * Math.PI * 2 * 1.5;
    const x = cx + rx * Math.cos(a);
    const y = cy + ry * Math.sin(a * 1.3);
    await tab.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 });
    if (gif && i % 5 === 0) {
      const { data } = await tab.send('Page.captureScreenshot', {
        format: 'png',
        clip: { x: card[0] + card[4], y: card[1] + card[5], width: card[2] + 24 + 510, height: card[3], scale: 0.6 },
      });
      frames.push(data);
    }
    i += 1;
    await sleep(16);
  }
  const [xe, ye] = [cx + rx, cy];
  await tab.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: xe, y: ye, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(700);
  const res = await tab.evaluate(`(() => { window.__stop = true; const s = window.__dragStart; const long = window.__long.filter((e) => e.t >= s); const fr = window.__frames.slice(1).sort((a, b) => a - b); const q = (p) => fr[Math.min(fr.length - 1, Math.floor(p * fr.length))]; return { long, longOver50: long.filter((e) => e.d > 50).length, maxLong: Math.max(0, ...long.map((e) => e.d)), frames: fr.length, p50: q(0.5), p95: q(0.95), max: fr[fr.length - 1], verdict: document.querySelector('.tie-verdict').innerText, you: document.querySelector('.tie-you') ? 'ok' : 'none' }; })()`);
  console.log(JSON.stringify({ phase, moves: i, gl: await glAlive(tab), ...res }, null, 2));
  if (gif) {
    const dir = path.join(outDir, 'gif');
    fs.mkdirSync(dir, { recursive: true });
    frames.forEach((d, k) => fs.writeFileSync(path.join(dir, `f${String(k).padStart(3, '0')}.png`), Buffer.from(d, 'base64')));
    console.log('gif frames', frames.length);
  }
  tab.close();
}

async function debug() {
  const tab = await openTab();
  const phase = await load(tab, { width: 1440, height: 900, lang: 'vi' });
  const st = () => tab.evaluate(`(() => { const c = document.querySelector('.tie-map-live canvas'); const card = document.querySelector('.tie-map-card'); const you = document.querySelector('.tie-you'); return { canvas: c && [c.style.width, c.style.height, c.width, c.height], card: [card.clientWidth, card.clientHeight], you: you && [you.style.left, you.style.top], pizza: document.querySelector('.tie-place').style.cssText, vh: innerHeight }; })()`);
  console.log('before', phase, JSON.stringify(await st()));
  await tab.evaluate(`document.querySelector('[data-area="btn"]').click()`);
  for (const ms of [100, 600, 1500, 4000]) { await sleep(ms); console.log(ms, JSON.stringify(await st())); }
  tab.close();
}
if (mode === 'debug') await debug();
else if (mode === 'shots') await shots();
else await drag({ gif: mode === 'gif' });
process.exit(0);
