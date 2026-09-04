#!/usr/bin/env node
/**
 * CivicConnect — Live Traffic Load Generator
 * Simulates realistic citizen traffic against CivicConnect microservices / Gateway.
 * Generates continuous metrics for Prometheus scraping & Grafana dashboard verification.
 *
 * Usage:
 *   node scripts/load-gen.js
 *   GATEWAY_URL=http://localhost:80 RATE=20 DURATION=60 node scripts/load-gen.js
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

const GATEWAY_URL = process.env.GATEWAY_URL || process.env.TARGET_URL || 'http://localhost:3002';
const RATE = parseInt(process.env.RATE || '10', 10); // requests per second
const DURATION = parseInt(process.env.DURATION || '0', 10); // 0 = run until Ctrl+C

const MANIPAL_LOCATIONS = [
  { lat: 13.3525, lng: 74.7928, address: 'Tiger Circle, Manipal', wardId: 'WARD-01', wardName: 'Tiger Circle' },
  { lat: 13.3538, lng: 74.7942, address: 'Kamath Circle, Manipal', wardId: 'WARD-01', wardName: 'Tiger Circle' },
  { lat: 13.3508, lng: 74.7915, address: 'Syndicate Circle, Manipal', wardId: 'WARD-02', wardName: 'Syndicate Circle' },
  { lat: 13.3562, lng: 74.7978, address: 'MIT Library Square, Manipal', wardId: 'WARD-01', wardName: 'Tiger Circle' },
  { lat: 13.3615, lng: 74.7872, address: 'End Point Viewpoint, Manipal', wardId: 'WARD-03', wardName: 'End Point' },
  { lat: 13.3458, lng: 74.7902, address: 'Manipal Lake Promenade, Manipal', wardId: 'WARD-04', wardName: 'Manipal Lake' },
];

const CATEGORIES = ['roads', 'garbage', 'streetlights', 'water', 'drainage'];
const SAMPLE_ISSUES = [
  'Simulated pothole on road surface requiring patching',
  'Simulated overflowing garbage container near shop',
  'Simulated broken sodium-vapor streetlight fixture',
  'Simulated broken water supply branch line',
  'Simulated blocked rain gutter overflow',
];

let totalRequests = 0;
let successRequests = 0;
let errorRequests = 0;
const latencies = [];
let knownIssueIds = [];

function request(targetUrl, options = {}, body = null) {
  const start = Date.now();
  return new Promise((resolve) => {
    try {
      const parsed = new URL(targetUrl);
      const lib = parsed.protocol === 'https:' ? https : http;

      const reqOpts = {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...(options.headers || {}),
        },
        timeout: 5000,
      };

      const req = lib.request(reqOpts, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          const duration = Date.now() - start;
          latencies.push(duration);
          if (latencies.length > 1000) latencies.shift();
          totalRequests++;
          if (res.statusCode >= 200 && res.statusCode < 400) {
            successRequests++;
          } else {
            errorRequests++;
          }
          let json = null;
          try { json = JSON.parse(data); } catch {}
          resolve({ status: res.statusCode, duration, data: json });
        });
      });

      req.on('error', () => {
        totalRequests++;
        errorRequests++;
        resolve({ status: 0, duration: Date.now() - start, data: null });
      });

      req.on('timeout', () => {
        req.destroy();
        totalRequests++;
        errorRequests++;
        resolve({ status: 408, duration: Date.now() - start, data: null });
      });

      if (body) {
        req.write(typeof body === 'string' ? body : JSON.stringify(body));
      }
      req.end();
    } catch {
      totalRequests++;
      errorRequests++;
      resolve({ status: 0, duration: 0, data: null });
    }
  });
}

async function refreshIssueCache() {
  const res = await request(`${GATEWAY_URL}/api/issues?limit=20`);
  if (res.status === 200 && res.data && res.data.data) {
    const list = res.data.data.issues || res.data.data;
    if (Array.isArray(list) && list.length > 0) {
      knownIssueIds = list.map((i) => i._id || i.id).filter(Boolean);
    }
  }
}

async function runScenario() {
  const r = Math.random();

  if (r < 0.60) {
    // 60% Read: list issues with category or status filter
    const cat = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
    await request(`${GATEWAY_URL}/api/issues?category=${cat}&limit=10`);
  } else if (r < 0.80) {
    // 20% Read: single issue lookup or health probe
    if (knownIssueIds.length > 0 && Math.random() < 0.7) {
      const id = knownIssueIds[Math.floor(Math.random() * knownIssueIds.length)];
      await request(`${GATEWAY_URL}/api/issues/${id}`);
    } else {
      await request(`${GATEWAY_URL}/health`);
    }
  } else if (r < 0.95) {
    // 15% Write: simulate new issue report
    const loc = MANIPAL_LOCATIONS[Math.floor(Math.random() * MANIPAL_LOCATIONS.length)];
    const cat = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
    const desc = SAMPLE_ISSUES[Math.floor(Math.random() * SAMPLE_ISSUES.length)] + ` (sim #${Math.floor(Math.random() * 10000)})`;

    const res = await request(`${GATEWAY_URL}/api/issues`, { method: 'POST' }, {
      reportedBy: `SIM-CITIZEN-${Math.floor(Math.random() * 50)}`,
      category: cat,
      rawDescription: desc,
      location: {
        lat: loc.lat + (Math.random() - 0.5) * 0.005,
        lng: loc.lng + (Math.random() - 0.5) * 0.005,
        address: loc.address,
        wardId: loc.wardId,
        wardName: loc.wardName,
        geohash: 'tdm6' + Math.random().toString(36).substring(2, 5),
      },
      channel: Math.random() < 0.5 ? 'app' : 'whatsapp',
      media: [],
    });

    if (res.status === 201 && res.data && res.data.data) {
      const newId = res.data.data._id || res.data.data.id;
      if (newId) knownIssueIds.push(newId);
    }
  } else {
    // 5% Write: community validation
    if (knownIssueIds.length > 0) {
      const id = knownIssueIds[Math.floor(Math.random() * knownIssueIds.length)];
      await request(`${GATEWAY_URL}/api/issues/${id}/validate`, { method: 'POST' }, {
        citizenId: `CITIZEN-${Math.floor(Math.random() * 100)}`,
        response: 'confirmed_bad',
      });
    } else {
      await request(`${GATEWAY_URL}/health`);
    }
  }
}

async function main() {
  console.log('====================================================');
  console.log('⚡ CivicConnect Traffic Generator (Load-Gen)');
  console.log('====================================================');
  console.log(`🎯 Target Gateway: ${GATEWAY_URL}`);
  console.log(`📈 Target Rate:    ${RATE} req/sec`);
  console.log(`⏱️ Duration:       ${DURATION > 0 ? DURATION + 's' : 'Infinite (press Ctrl+C to stop)'}`);
  console.log('----------------------------------------------------\n');

  await refreshIssueCache();
  setInterval(refreshIssueCache, 15000);

  const startTime = Date.now();
  const intervalMs = 1000 / RATE;

  const timer = setInterval(runScenario, intervalMs);

  // Status reporter every 5 seconds
  const reporter = setInterval(() => {
    const elapsed = Math.max(1, Math.round((Date.now() - startTime) / 1000));
    const currentRps = (totalRequests / elapsed).toFixed(1);
    const avgLatency = latencies.length
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : 0;

    process.stdout.write(
      `\r📊 [${elapsed}s] Total: ${totalRequests} | OK: ${successRequests} | Err: ${errorRequests} | RPS: ${currentRps} | Avg Latency: ${avgLatency}ms   `
    );

    if (DURATION > 0 && elapsed >= DURATION) {
      clearInterval(timer);
      clearInterval(reporter);
      console.log('\n\n✅ Duration completed!');
      printSummary();
      process.exit(0);
    }
  }, 3000);

  function printSummary() {
    console.log('\n====================================================');
    console.log('📊 Load Test Summary:');
    console.log(`   Total Requests: ${totalRequests}`);
    console.log(`   Success:        ${successRequests}`);
    console.log(`   Errors:         ${errorRequests}`);
    const sorted = [...latencies].sort((a, b) => a - b);
    if (sorted.length > 0) {
      const p50 = sorted[Math.floor(sorted.length * 0.5)];
      const p95 = sorted[Math.floor(sorted.length * 0.95)];
      const p99 = sorted[Math.floor(sorted.length * 0.99)];
      console.log(`   p50 Latency:    ${p50} ms`);
      console.log(`   p95 Latency:    ${p95} ms`);
      console.log(`   p99 Latency:    ${p99} ms`);
    }
    console.log('====================================================\n');
  }

  process.on('SIGINT', () => {
    clearInterval(timer);
    clearInterval(reporter);
    printSummary();
    process.exit(0);
  });
}

main().catch(console.error);
