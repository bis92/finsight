import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'

import * as chromeLauncher from 'chrome-launcher'
import lighthouse from 'lighthouse'

const args = process.argv.slice(2)
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`)
  if (i === -1) return fallback
  const next = args[i + 1]
  return next && !next.startsWith('--') ? next : true
}

const outPath = flag('out', null)
const skipBuild = flag('skip-build', false) === true
const runs = Number(flag('runs', 3))
const wantedPort = flag('port', null)

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.on('error', reject)
    srv.listen(0, () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })
}

function run(cmd, cmdArgs, opts = {}) {
  const child = spawn(cmd, cmdArgs, { stdio: 'inherit', ...opts })
  return new Promise((resolve, reject) => {
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))))
    child.on('error', reject)
  })
}

async function waitForServer(url, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { redirect: 'manual' })
      if (res.status > 0) return
    } catch {
      // 서버 아직 안 뜸
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`server not ready at ${url}`)
}

function toReport(lhr, url) {
  const cat = lhr.categories
  const audit = (id) => lhr.audits[id]?.numericValue ?? 0
  const opportunities = Object.values(lhr.audits)
    .filter((a) => a.details?.type === 'opportunity' && (a.details.overallSavingsMs ?? 0) > 0)
    .map((a) => ({ id: a.id, title: a.title, savingsMs: Math.round(a.details.overallSavingsMs) }))
    .sort((a, b) => b.savingsMs - a.savingsMs)
  return {
    url,
    fetchedAt: new Date().toISOString(),
    scores: {
      performance: Math.round((cat.performance?.score ?? 0) * 100),
      accessibility: Math.round((cat.accessibility?.score ?? 0) * 100),
      bestPractices: Math.round((cat['best-practices']?.score ?? 0) * 100),
      seo: Math.round((cat.seo?.score ?? 0) * 100),
    },
    metrics: {
      lcp: Math.round(audit('largest-contentful-paint')),
      tbt: Math.round(audit('total-blocking-time')),
      cls: Number(audit('cumulative-layout-shift').toFixed(3)),
      fcp: Math.round(audit('first-contentful-paint')),
      si: Math.round(audit('speed-index')),
    },
    opportunities,
  }
}

async function main() {
  if (!skipBuild) {
    await run('./node_modules/.bin/next', ['build'])
  }

  const port = Number(wantedPort) || (await getFreePort())
  const url = `http://localhost:${port}/`
  const server = spawn('./node_modules/.bin/next', ['start', '-p', String(port)], { stdio: 'inherit' })

  let chrome
  try {
    await waitForServer(url)
    chrome = await chromeLauncher.launch({ chromeFlags: ['--headless=new', '--no-sandbox'] })

    const reports = []
    for (let i = 0; i < runs; i++) {
      const result = await lighthouse(
        url,
        { port: chrome.port, output: 'json', logLevel: 'error' },
        {
          extends: 'lighthouse:default',
          settings: {
            onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
            // 실측(applied) 스로틀링. 기본 Lantern 시뮬레이션은 이 랜딩에서 LCP를
            // (부풀려진) 시뮬 TTI에 고정해 관측 LCP 140ms를 14.5s로 보고하는 아티팩트가 있다.
            // devtools 스로틀링은 관측 페인트 기반이라 LCP가 신뢰 가능하다.
            throttlingMethod: 'devtools',
          },
        },
      )
      reports.push(toReport(result.lhr, url))
    }

    // Performance 점수 기준 median run 채택
    reports.sort((a, b) => a.scores.performance - b.scores.performance)
    const median = reports[Math.floor(reports.length / 2)]

    const json = JSON.stringify(median, null, 2)
    if (outPath) await writeFile(outPath, json)
    process.stdout.write(json + '\n')
  } finally {
    if (chrome) await chrome.kill()
    server.kill('SIGTERM')
    // next start가 SIGTERM 무시할 경우 대비
    setTimeout(() => server.kill('SIGKILL'), 3000).unref()
    await Promise.race([once(server, 'exit'), new Promise((r) => setTimeout(r, 4000))])
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
