#!/usr/bin/env node
/*
  ddgame-design 截圖與檢查（Node 22+，需要 Chrome 或 Edge，不需安裝任何套件）

    node .claude/skills/ddgame-design/scripts/shot.mjs --url http://localhost:5173/DDgame/ --out <資料夾>
      [--widths 1440,820,390] [--themes light,dark] [--chrome <瀏覽器路徑>] [--port 9333]

  每個寬度 × 主題輸出兩張：<theme>-<width>-fold.png（首屏）與 <theme>-<width>-full.png（全頁）。
  這個專案的 html/body 是 overflow-hidden，捲動發生在 app 內的容器；腳本會自動找出最高的捲動容器，
  把視窗拉高到它的內容高度來拍全頁。
  主題用 localStorage.theme（'light' / 'dark'）切換，與 index.html 的開機腳本相同。

  檢查項目（任一失敗時 exit code = 1）：
    - hScroll：頁面或捲動容器有橫向捲動
    - smallTargets：可見的 a / button / [role=button] / input / select 小於 44×44px
    - fontHuninn：頁面有用到 font-display 但 Huninn 沒載入（警告，不算失敗）
*/
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true])
  return acc
}, []))
if (!args.url || !args.out) {
  console.error('用法：node shot.mjs --url <網址> --out <資料夾> [--widths 1440,820,390] [--themes light,dark]')
  process.exit(2)
}
const widths = String(args.widths || '1440,820,390').split(',').map(Number)
const themes = String(args.themes || 'light,dark').split(',')
const port = Number(args.port || 9333)
const HEIGHTS = { 1440: 900, 1024: 768, 820: 1180, 768: 1024, 390: 844, 375: 812, 320: 640 }

const candidates = [
  args.chrome, process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].filter(Boolean)
const chromePath = candidates.find(p => fs.existsSync(p))
if (!chromePath) { console.error('找不到 Chrome / Edge，請用 --chrome 指定路徑'); process.exit(2) }

fs.mkdirSync(args.out, { recursive: true })
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'ddgame-shot-'))
const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`,
  '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', 'about:blank'])
const sleep = ms => new Promise(r => setTimeout(r, ms))

let ws
for (let i = 0; i < 60 && !ws; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
    const page = list.find(t => t.type === 'page')
    if (page) ws = new WebSocket(page.webSocketDebuggerUrl)
  } catch {}
  if (!ws) await sleep(250)
}
if (!ws) { console.error('無法連上 headless 瀏覽器'); chrome.kill(); process.exit(2) }
await new Promise(r => ws.addEventListener('open', r))
let seq = 0
const pending = new Map()
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data)
  if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
})
const send = (method, params = {}) => new Promise(r => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })) })
const evalJs = async expr => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value
const save = (name, data) => fs.writeFileSync(path.join(args.out, name), Buffer.from(data, 'base64'))

await send('Page.enable')
await send('Runtime.enable')

const PROBE = `(() => {
  const all = [document.scrollingElement, ...document.querySelectorAll('body *')];
  let sc = document.scrollingElement;
  for (const el of all) {
    const oy = getComputedStyle(el).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > sc.scrollHeight) sc = el;
  }
  const hScroll = document.documentElement.scrollWidth > innerWidth + 1 || sc.scrollWidth > sc.clientWidth + 1;
  const smallTargets = [...document.querySelectorAll('a,button,[role=button],input,select,textarea')]
    .filter(el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && (r.height < 44 || r.width < 44) })
    .map(el => ((el.getAttribute('aria-label') || el.textContent || el.tagName).trim().replace(/\\s+/g, ' ').slice(0, 24)) + ' ' + Math.round(el.getBoundingClientRect().width) + 'x' + Math.round(el.getBoundingClientRect().height));
  const usesDisplay = !!document.querySelector('.font-display');
  const fontHuninn = !usesDisplay || document.fonts.check('40px Huninn', '甜');
  return { scrollH: Math.max(sc.scrollHeight, innerHeight), hScroll, smallTargets, fontHuninn };
})()`

const report = []
for (const theme of themes) {
  for (const w of widths) {
    const h = HEIGHTS[w] || 900
    const mobile = w < 1024
    const metrics = height => ({ width: w, height, deviceScaleFactor: mobile ? 2 : 1, mobile })
    await send('Emulation.setDeviceMetricsOverride', metrics(h))
    await send('Page.navigate', { url: args.url })
    await sleep(800)
    await evalJs(`localStorage.setItem('theme', '${theme === 'dark' ? 'dark' : 'light'}'); 1`)
    await send('Page.reload')
    await sleep(1500)
    await evalJs('document.fonts.ready.then(() => 1)')
    await sleep(300)
    const m = await evalJs(PROBE)
    save(`${theme}-${w}-fold.png`, (await send('Page.captureScreenshot', { format: 'png' })).result.data)
    await send('Emulation.setDeviceMetricsOverride', metrics(Math.min(m.scrollH, 16000)))
    await sleep(600)
    save(`${theme}-${w}-full.png`, (await send('Page.captureScreenshot', { format: 'png' })).result.data)
    report.push({ theme, width: w, ...m })
  }
}
ws.close()
chrome.kill()

let failed = false
for (const r of report) {
  const issues = []
  if (r.hScroll) { issues.push('有橫向捲動'); failed = true }
  if (r.smallTargets.length) { issues.push(`小於 44px：${r.smallTargets.join('、')}`); failed = true }
  if (!r.fontHuninn) issues.push('警告：Huninn 未載入')
  console.log(`${r.theme.padEnd(5)} ${String(r.width).padStart(4)}  ${issues.length ? issues.join('；') : 'OK'}`)
}
console.log(`\n截圖：${path.resolve(args.out)}`)
process.exit(failed ? 1 : 0)
