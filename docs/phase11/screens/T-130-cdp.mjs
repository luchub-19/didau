// CDP đo landing (T-130). Node ≥ 22 (WebSocket toàn cục). Chrome chạy kèm EGL mesa (xem DESIGN gđ11 §Cách đo).
// node T-130-cdp.mjs <chromePort> <baseUrl> <mode> [outDir] [axePath]
//   perf    : LCP/CLS/TBT 3 lượt × (1440, 390) trên Fast 4G + CPU 4×, byte tải, WebGL sống theo thời gian
//   matrix  : 360/390/768/1280/1440 × vi/en × motion on/off — tràn ngang, axe, ảnh nguyên trang (outDir)
//   glfast  : cuộn thẳng tới #tie ngay sau tải, theo dõi số WebGL sống/gắn DOM mỗi 50 ms
//   contrast: tương phản chữ thật đọc từ ảnh chụp (mọi chữ nhìn thấy, 5 cấu hình)
//   final   : ảnh cuối webp (1440/390 × vi/en: hero, chat, photo, tie, numbers, end); gif-open / gif-lock: khung PNG cho GIF
//   kbd     : bàn phím toàn trang (Tab qua mọi điểm dừng, vòng focus nhìn thấy)
import fs from 'node:fs';
import path from 'node:path';

const [port, base, mode, outDir = '.', axePath] = process.argv.slice(2);
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
  return {
    send,
    evaluate,
    on: (l) => listeners.push(l),
    close: async () => {
      await fetch(`http://127.0.0.1:${port}/json/close/${t.id}`).catch(() => {});
      ws.close();
    },
  };
}

// Chèn trước mọi script của trang: bọc getContext (đếm WebGL) + quan sát LCP/CLS/longtask/paint.
const PROBE = `(() => {
  window.__gl = [];
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const ctx = orig.call(this, type, ...rest);
    if (ctx && /webgl/.test(type) && !window.__gl.some((g) => g.ctx === ctx)) window.__gl.push({ canvas: this, ctx, t: performance.now() });
    return ctx;
  };
  window.__lcp = null; window.__cls = 0; window.__clsEntries = []; window.__long = []; window.__fcp = null;
  const obs = (type, fn) => { try { new PerformanceObserver((l) => l.getEntries().forEach(fn)).observe({ type, buffered: true }); } catch {} };
  obs('largest-contentful-paint', (e) => { window.__lcp = { t: e.startTime, tag: e.element && e.element.tagName, id: e.element && e.element.id, cls: e.element && String(e.element.className).slice(0, 60), size: e.size, url: e.url }; });
  obs('layout-shift', (e) => { if (!e.hadRecentInput) { window.__cls += e.value; window.__clsEntries.push({ t: e.startTime, v: e.value, src: (e.sources || []).map((s) => s.node && (s.node.id || s.node.className || s.node.tagName)).slice(0, 2) }); } });
  obs('longtask', (e) => window.__long.push({ t: e.startTime, d: e.duration }));
  obs('paint', (e) => { if (e.name === 'first-contentful-paint') window.__fcp = e.startTime; });
  window.__glNow = () => window.__gl.filter((g) => !g.ctx.isContextLost()).length;
  window.__glAttached = () => window.__gl.filter((g) => !g.ctx.isContextLost() && g.canvas.isConnected).length;
})();`;

const FAST_4G = { offline: false, latency: 225, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8 };

async function prepare(tab, { width, height, lang = 'vi', reduced = false, throttle = false, touch = width < 500, extraQuery = '' }) {
  await tab.send('Page.enable');
  await tab.send('Runtime.enable');
  await tab.send('Network.enable');
  await tab.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 500 });
  if (touch) await tab.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await tab.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }] });
  await tab.send('Network.setCacheDisabled', { cacheDisabled: true });
  if (throttle) {
    await tab.send('Network.emulateNetworkConditions', FAST_4G);
    await tab.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }
  await tab.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `try { localStorage.setItem('didau.lang', '${lang}'); } catch {} ${PROBE}`,
  });
  return extraQuery;
}

const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

// ---------------------------------------------------------------- perf
async function perf() {
  const out = [];
  for (const width of [1440, 390]) {
    const runs = [];
    for (let run = 0; run < 3; run += 1) {
      const tab = await openTab();
      await prepare(tab, { width, height: width > 500 ? 900 : 844, throttle: true });
      const reqs = new Map();
      let loadAt = null;
      tab.on((m) => {
        if (m.method === 'Network.requestWillBeSent') reqs.set(m.params.requestId, { url: m.params.request.url, type: m.params.type, bytes: 0, t: m.params.timestamp });
        if (m.method === 'Network.loadingFinished') { const r = reqs.get(m.params.requestId); if (r) r.bytes = m.params.encodedDataLength; }
        if (m.method === 'Page.loadEventFired') loadAt = m.params.timestamp;
      });
      const t0 = Date.now();
      await tab.send('Page.navigate', { url: base });
      // Lấy mẫu WebGL còn sống mỗi 500 ms trong 14 s đầu (không cuộn)
      const gl = [];
      while (Date.now() - t0 < 14000) {
        gl.push(await tab.evaluate(`[window.__glNow ? window.__glNow() : 0, window.__glAttached ? window.__glAttached() : 0]`).catch(() => [0, 0]));
        await sleep(500);
      }
      const first = await tab.evaluate(`({ lcp: window.__lcp, cls: window.__cls, fcp: window.__fcp, long: window.__long, clsE: window.__clsEntries, total: window.__gl.length })`);
      // Cuộn như người thật tới cuối rồi về lại, lấy CLS cuối + WebGL
      const glScroll = [];
      await tab.evaluate(`(async () => { const h = document.documentElement.scrollHeight; for (let y = 0; y < h; y += 500) { scrollTo(0, y); await new Promise(r => setTimeout(r, 140)); } })()`);
      for (let i = 0; i < 6; i += 1) { glScroll.push(await tab.evaluate(`[window.__glNow(), window.__glAttached()]`)); await sleep(500); }
      const after = await tab.evaluate(`({ cls: window.__cls, clsE: window.__clsEntries, long: window.__long, h: document.documentElement.scrollHeight, over: document.documentElement.scrollWidth - innerWidth })`);
      const reqList = [...reqs.values()];
      const sum = (f) => reqList.filter(f).reduce((s, r) => s + r.bytes, 0);
      const fcp = first.fcp ?? 0;
      const tbt = (list, until) => list.filter((e) => e.t >= fcp && e.t < until).reduce((s, e) => s + Math.max(0, e.d - 50), 0);
      runs.push({
        lcp: first.lcp?.t, lcpEl: `${first.lcp?.tag}#${first.lcp?.id || ''}.${first.lcp?.cls || ''}${first.lcp?.url ? ' ' + first.lcp.url : ''}`,
        fcp, clsFirst: first.cls, clsAfterScroll: after.cls, tbt10s: tbt(first.long, 10000), longTasks: first.long.length, maxLong: Math.max(0, ...first.long.map((e) => e.d)),
        clsEntries: after.clsE.filter((e) => e.v > 0.001),
        jsBytes: sum((r) => r.type === 'Script'), imgBytes: sum((r) => r.type === 'Image'), cssBytes: sum((r) => r.type === 'Stylesheet'), fontBytes: sum((r) => r.type === 'Font'),
        total: sum(() => true),
        scripts: reqList.filter((r) => r.type === 'Script').map((r) => `${r.url.split('/').pop()} ${r.bytes}`),
        images: reqList.filter((r) => r.type === 'Image').map((r) => `${r.url.split('/').pop().slice(0, 50)} ${r.bytes}`),
        glMaxAlive: Math.max(...gl.map((g) => g[0]), ...glScroll.map((g) => g[0])), glMaxAttached: Math.max(...gl.map((g) => g[1]), ...glScroll.map((g) => g[1])),
        glEndAlive: glScroll.at(-1)[0], glEndAttached: glScroll.at(-1)[1], glCreated: first.total, pageH: after.h, over: after.over,
      });
      await tab.close();
    }
    out.push({
      width,
      median: { lcp: median(runs.map((r) => r.lcp)), clsFirst: median(runs.map((r) => r.clsFirst)), clsAfterScroll: median(runs.map((r) => r.clsAfterScroll)), tbt10s: median(runs.map((r) => r.tbt10s)) },
      runs,
    });
  }
  console.log(JSON.stringify(out, null, 2));
}

// ---------------------------------------------------------------- matrix
async function scrollThrough(tab) {
  await tab.evaluate(`(async () => { const h = document.documentElement.scrollHeight; for (let y = 0; y < h; y += 400) { scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); } scrollTo(0, 0); })()`);
}

async function matrix() {
  fs.mkdirSync(outDir, { recursive: true });
  const axeSrc = fs.readFileSync(axePath, 'utf8');
  const report = [];
  for (const width of [360, 390, 768, 1280, 1440]) {
    for (const lang of ['vi', 'en']) {
      for (const reduced of [false, true]) {
        const tab = await openTab();
        await prepare(tab, { width, height: width > 500 ? 900 : 844, lang, reduced });
        await tab.send('Page.navigate', { url: base });
        await sleep(2500);
        await scrollThrough(tab);
        await sleep(3500);
        const info = await tab.evaluate(`(() => {
          const de = document.documentElement;
          const wide = [...document.querySelectorAll('body *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > innerWidth + 1 && getComputedStyle(e).position !== 'fixed'; }).slice(0, 5).map((e) => (e.id || e.className || e.tagName).toString().slice(0, 50));
          return { over: de.scrollWidth - innerWidth, h: de.scrollHeight, wide, hiddenSections: [...document.querySelectorAll('section[id]')].filter((s) => getComputedStyle(s).opacity === '0').map((s) => s.id), lang: document.documentElement.lang, title: document.querySelector('h1')?.innerText };
        })()`);
        await tab.evaluate(axeSrc);
        const axe = await tab.evaluate(`axe.run(document, { resultTypes: ['violations', 'incomplete'] }).then((r) => ({ violations: r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, sample: v.nodes.slice(0, 3).map((n) => n.target.join(' ') + ' :: ' + (n.any[0]?.message || n.all[0]?.message || n.none[0]?.message || '').slice(0, 140)) })), incomplete: r.incomplete.map((v) => ({ id: v.id, n: v.nodes.length, sample: v.nodes.slice(0, 4).map((n) => n.target.join(' ')) })) }))`);
        const tag = `${width}-${lang}-${reduced ? 'static' : 'full'}`;
        // Ảnh nguyên trang: chỉ 2 tổ hợp đại diện mỗi khổ để không đầy thư mục
        if (!reduced) {
          const { data } = await tab.send('Page.captureScreenshot', { format: 'webp', quality: 80, captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: Math.min(info.h, 16000), scale: 1 } });
          fs.writeFileSync(path.join(outDir, `T-130-${tag}-full.webp`), Buffer.from(data, 'base64'));
        }
        report.push({ tag, ...info, axe });
        await tab.close();
      }
    }
  }
  console.log(JSON.stringify(report, null, 2));
}

// ---------------------------------------------------------------- kbd
async function kbd() {
  const tab = await openTab();
  await prepare(tab, { width: 1440, height: 900, lang: 'vi', touch: false });
  await tab.send('Page.navigate', { url: base });
  await sleep(3000);
  const stops = [];
  const desc = `(() => { const e = document.activeElement; if (!e || e === document.body) return null; const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || /rgb/.test(cs.boxShadow.replace(/rgba\\(0, 0, 0, 0\\)/g, '')); return { tag: e.tagName.toLowerCase(), label: (e.getAttribute('aria-label') || e.innerText || e.getAttribute('title') || e.getAttribute('data-area') || e.id || '').trim().slice(0, 40), role: e.getAttribute('role'), ring, outline: cs.outlineStyle + ' ' + cs.outlineWidth + ' ' + cs.outlineColor, vis: r.width > 0 && r.height > 0, inView: r.bottom > 0 && r.top < innerHeight, y: Math.round(r.top + scrollY), sec: e.closest('section[id],header,footer')?.id || e.closest('header,footer')?.tagName.toLowerCase() || '' }; })()`;
  for (let i = 0; i < 120; i += 1) {
    await tab.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await tab.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await sleep(120);
    const d = await tab.evaluate(desc);
    if (!d) { stops.push({ end: true, i }); if (i > 5) break; continue; }
    stops.push(d);
  }
  const noRing = stops.filter((s) => !s.end && (!s.ring || !s.vis));
  const hidden = stops.filter((s) => !s.end && !s.inView);
  console.log(JSON.stringify({ count: stops.length, noRing, hidden, stops: stops.map((s) => (s.end ? 'END' : `${s.sec}|${s.tag}${s.role ? '[' + s.role + ']' : ''}|${s.label}|ring=${s.ring}`)) }, null, 2));
  await tab.close();
}

// ---------------------------------------------------------------- glfast
// Người xem cuộn rất nhanh xuống #tie ngay sau khi tải (bản đồ hero chưa nhả): có lúc nào > 1 context gắn DOM không?
async function glfast() {
  const out = [];
  for (const width of [1440, 1280]) {
    const tab = await openTab();
    await prepare(tab, { width, height: 900, throttle: true });
    await tab.send('Page.navigate', { url: base });
    await sleep(1800);
    await tab.evaluate(`(() => { window.__tl = []; let last = ''; setInterval(() => { const s = window.__glNow() + '/' + window.__glAttached() + '/' + window.__gl.length; if (s !== last) { window.__tl.push([Math.round(performance.now()), s]); last = s; } }, 50); })()`);
    await tab.evaluate(`document.getElementById('tie').scrollIntoView()`);
    await sleep(20000);
    const tl = await tab.evaluate(`window.__tl`);
    const maxAttached = Math.max(...tl.map(([, s]) => +s.split('/')[1]));
    out.push({ width, maxAttached, maxAlive: Math.max(...tl.map(([, s]) => +s.split('/')[0])), timeline: tl, phase: await tab.evaluate(`document.querySelector('.tie-map-card')?.dataset.phase`) });
    await tab.close();
  }
  console.log(JSON.stringify(out, null, 1));
}

// ---------------------------------------------------------------- contrast
// Tương phản chữ thật: chụp từng màn, mỗi phần tử chữ nhìn thấy → nền = màu xuất hiện nhiều nhất trong khung chữ (đọc từ ảnh chụp,
// không đoán từ token), chữ = màu tính được trộn alpha/opacity tổ tiên. Ngưỡng WCAG AA: 4,5:1; chữ lớn (≥ 24px hoặc ≥ 18,66px đậm) 3:1.
// `spread` = độ lệch độ sáng của nền (cao = chữ nằm trên ảnh/gradient, cần xem tay).
const LUM = `(c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); }`;
async function contrast() {
  const helper = await openTab();
  await helper.send('Page.navigate', { url: 'about:blank' });
  const results = [];
  for (const [width, lang] of [[1440, 'vi'], [1440, 'en'], [390, 'vi'], [390, 'en'], [768, 'vi']]) {
    const tab = await openTab();
    const height = width > 500 ? 900 : 844;
    await prepare(tab, { width, height, lang, touch: width < 500 });
    await tab.send('Page.navigate', { url: base });
    await sleep(2500);
    await scrollThrough(tab);
    await sleep(3000);
    const total = await tab.evaluate(`document.documentElement.scrollHeight`);
    const seen = new Set();
    for (let y = 0; y < total; y += Math.round(height * 0.8)) {
      await tab.evaluate(`scrollTo(0, ${y})`);
      await sleep(900);
      const items = await tab.evaluate(`(() => {
        const out = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const els = new Set();
        while (walker.nextNode()) { const n = walker.currentNode; if (n.nodeValue.trim().length > 0 && n.parentElement) els.add(n.parentElement); }
        let k = 0;
        for (const e of els) {
          if (e.closest('script,style,noscript,svg,canvas,.maplibregl-canvas-container')) continue;
          const r = e.getBoundingClientRect();
          if (r.width < 2 || r.height < 2 || r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth) continue;
          const cs = getComputedStyle(e);
          if (cs.visibility === 'hidden' || cs.display === 'none') continue;
          // Bỏ chữ bị che/cắt (hàng chip cuộn ngang, <details> đóng vẫn trả rect khi hỏi layout): ít nhất 1 trong 3 điểm phải trúng nó
          const pts = [[0.5, 0.5], [0.15, 0.5], [0.85, 0.5]].map(([px, py]) => document.elementFromPoint(r.left + r.width * px, r.top + r.height * py));
          if (!pts.some((h) => h && (e.contains(h) || h.contains(e)))) continue;
          let op = 1, hid = false;
          for (let a = e; a; a = a.parentElement) { op *= parseFloat(getComputedStyle(a).opacity); if (a.getAttribute('aria-hidden') === 'true') hid = true; }
          if (op < 0.05) continue;
          const m = cs.color.match(/[0-9.]+/g).map(Number);
          const key = (e.id || e.className.toString().slice(0, 40) || e.tagName) + '|' + e.textContent.trim().slice(0, 30);
          out.push({ key, text: e.textContent.trim().slice(0, 40), x: r.left, y: r.top, w: r.width, h: r.height, fg: m.slice(0, 3), a: (m[3] ?? 1) * op, size: parseFloat(cs.fontSize), weight: parseInt(cs.fontWeight, 10), hidden: hid, y0: Math.round(r.top + scrollY) });
        }
        return out;
      })()`);
      const { data } = await tab.send('Page.captureScreenshot', { format: 'png' });
      const checked = await helper.evaluate(`(async () => {
        const L = ${LUM};
        const img = new Image(); img.src = 'data:image/png;base64,${data}'; await img.decode();
        const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
        const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0);
        const items = ${JSON.stringify(items)};
        return items.map((it) => {
          const x = Math.max(0, Math.floor(it.x)), y = Math.max(0, Math.floor(it.y)), w = Math.max(1, Math.min(img.width - x, Math.ceil(it.w))), h = Math.max(1, Math.min(img.height - y, Math.ceil(it.h)));
          const d = cx.getImageData(x, y, w, h).data;
          const hist = new Map();
          for (let i = 0; i < d.length; i += 4) { const k = ((d[i] >> 2) << 16) | ((d[i + 1] >> 2) << 8) | (d[i + 2] >> 2); hist.set(k, (hist.get(k) || 0) + 1); }
          // Nền = màu nhiều nhất KHÔNG gần màu chữ (chữ lớn đậm có thể chiếm nhiều điểm nhất)
          const near = (k) => { const r = ((k >> 16) & 255) << 2, g = ((k >> 8) & 255) << 2, b = (k & 255) << 2; return Math.abs(r - it.fg[0]) + Math.abs(g - it.fg[1]) + Math.abs(b - it.fg[2]) < 36; };
          let best = 0, bk = 0; for (const [k, n] of hist) if (n > best && !near(k)) { best = n; bk = k; }
          if (best === 0) for (const [k, n] of hist) if (n > best) { best = n; bk = k; }
          const bg = [((bk >> 16) & 255) << 2, ((bk >> 8) & 255) << 2, (bk & 255) << 2];
          const fg = it.fg.map((v, i) => Math.round(v * it.a + bg[i] * (1 - it.a)));
          const l1 = L(fg), l2 = L(bg); const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
          const lums = []; for (let i = 0; i < d.length; i += 16) lums.push(L([d[i], d[i + 1], d[i + 2]]));
          const mn = Math.min(...lums), mx = Math.max(...lums);
          const worst = (Math.max(l1, mn, mx) + 0.05) / (Math.min(l1, mn, mx) + 0.05); // chỉ để thấy phân tán, không dùng làm kết luận
          const large = it.size >= 24 || (it.size >= 18.66 && it.weight >= 700);
          return { key: it.key, text: it.text, ratio: Math.round(ratio * 100) / 100, need: large ? 3 : 4.5, size: it.size, bg: bg.join(','), fg: fg.join(','), spread: Math.round((mx - mn) * 100) / 100, hidden: it.hidden, y0: it.y0 };
        });
      })()`);
      for (const c of checked) {
        const id = width + lang + c.key;
        if (seen.has(id)) continue;
        seen.add(id);
        results.push({ width, lang, ...c });
      }
    }
    await tab.close();
  }
  await helper.close();
  const bad = results.filter((r) => r.ratio < r.need);
  console.log(JSON.stringify({ checked: results.length, minRatio: Math.min(...results.map((r) => r.ratio / r.need)), failing: bad, lowSpread: results.filter((r) => r.spread > 0.35 && r.ratio >= r.need).map((r) => `${r.width}${r.lang} ${r.text} ratio=${r.ratio} spread=${r.spread}`) }, null, 1));
}

// ---------------------------------------------------------------- final (ảnh cuối + khung hình GIF)
async function clipShot(tab, sel, file, { pad = 0 } = {}) {
  const r = await tab.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.scrollIntoView({ block: 'start' }); const b = e.getBoundingClientRect(); return { x: 0, y: b.top + scrollY, w: innerWidth, h: Math.min(b.height, 2600) }; })()`);
  await sleep(900);
  const { data } = await tab.send('Page.captureScreenshot', { format: 'webp', quality: 82, captureBeyondViewport: true, clip: { x: r.x, y: r.y - pad, width: r.w, height: r.h + pad, scale: 1 } });
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
}

async function finalShots() {
  fs.mkdirSync(outDir, { recursive: true });
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    for (const lang of ['vi', 'en']) {
      const tab = await openTab();
      await prepare(tab, { width, height, lang, touch: width < 500 });
      await tab.send('Page.navigate', { url: base });
      await sleep(4200);
      const pre = path.join(outDir, `${width}-${lang}`);
      const { data } = await tab.send('Page.captureScreenshot', { format: 'webp', quality: 82 });
      fs.writeFileSync(`${pre}-hero.webp`, Buffer.from(data, 'base64'));
      await scrollThrough(tab);
      await sleep(2500);
      await clipShot(tab, '#chat', `${pre}-chat.webp`);
      await clipShot(tab, '#photo', `${pre}-photo.webp`);
      // Phần hoà phiếu: chờ bản đồ lên, bấm chip Gò Vấp (kết quả đổi), rồi chụp
      await tab.evaluate(`document.getElementById('tie').scrollIntoView()`);
      for (let i = 0; i < 40; i += 1) { if ((await tab.evaluate(`document.querySelector('.tie-map-card')?.dataset.phase`)) === 'live') break; await sleep(500); }
      await sleep(2500);
      await tab.evaluate(`document.querySelector('[data-area="gv"]').click()`);
      await sleep(1600);
      await clipShot(tab, '#tie', `${pre}-tie.webp`);
      await clipShot(tab, '#numbers', `${pre}-numbers.webp`);
      await clipShot(tab, '#end', `${pre}-end.webp`);
      await tab.close();
    }
  }
}

// GIF: mở màn (bốn bạn hội tụ) và chốt. Lưu khung vào outDir/<name>/fNNN.png rồi ghép bằng ffmpeg ngoài script.
async function gifFrames(name, { act, ms }) {
  const dir = path.join(outDir, name);
  fs.mkdirSync(dir, { recursive: true });
  const tab = await openTab();
  await prepare(tab, { width: 1440, height: 900, lang: 'vi', touch: false });
  await tab.send('Page.bringToFront');
  const t0 = Date.now();
  let i = 0;
  const grab = async () => {
    try {
      const { data } = await tab.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 1440, height: 760, scale: 0.7 } });
      fs.writeFileSync(path.join(dir, `f${String(i).padStart(3, '0')}.png`), Buffer.from(data, 'base64'));
      i += 1;
    } catch {
      await sleep(40); // trang đang đổi tài liệu lúc mới điều hướng
    }
  };
  if (act === 'open') {
    await tab.send('Page.navigate', { url: base });
    while (Date.now() - t0 < ms) await grab();
  } else {
    await tab.send('Page.navigate', { url: base });
    await sleep(5000);
    for (let k = 0; k < 4; k += 1) await grab();
    await tab.evaluate(`[...document.querySelectorAll('button')].find((b) => /Chốt Pizza/.test(b.textContent)).click()`);
    const t1 = Date.now();
    while (Date.now() - t1 < ms) await grab();
    for (let k = 0; k < 6; k += 1) { await sleep(120); await grab(); }
  }
  console.log(name, i, 'frames', ((Date.now() - t0) / 1000).toFixed(1), 's');
  await tab.close();
}

if (mode === 'perf') await perf();
else if (mode === 'final') await finalShots();
else if (mode === 'gif-open') await gifFrames('gif-open', { act: 'open', ms: 4200 });
else if (mode === 'gif-lock') await gifFrames('gif-lock', { act: 'lock', ms: 2600 });
else if (mode === 'contrast') await contrast();
else if (mode === 'glfast') await glfast();
else if (mode === 'matrix') await matrix();
else if (mode === 'kbd') await kbd();
else throw new Error('mode?');
process.exit(0);
