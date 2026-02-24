#!/usr/bin/env node
/**
 * Simple load generator - sustains traffic to populate traces and profiles.
 * Usage: node scripts/load-generator.js [options]
 * Options: --url http://localhost:3000 (default) --interval 500 (ms)
 */

const url = process.argv.find((a) => a.startsWith('--url='))?.split('=')[1] || 'http://localhost:3000';
const intervalMs = parseInt(
  process.argv.find((a) => a.startsWith('--interval='))?.split('=')[1] || '500',
  10
);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(path, options = {}) {
  const target = new URL(path, url);
  try {
    const res = await fetch(target.toString(), options);
    return res.status;
  } catch (err) {
    console.error(`[${new Date().toISOString()}] ${path} failed:`, err.message);
    return 0;
  }
}

async function run() {
  console.log(`Load generator: ${url}, interval ${intervalMs}ms`);
  let count = 0;

  for (;;) {
    const name = `item-${Date.now()}-${count}`;
    await request('/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    await request('/api/items');
    count++;
    if (count % 50 === 0) {
      console.log(`[${new Date().toISOString()}] ${count} requests`);
    }
    await sleep(intervalMs);
  }
}

run().catch(console.error);
