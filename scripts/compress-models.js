#!/usr/bin/env node
/**
 * Compress all GLBs with Draco via @gltf-transform/cli.
 * Writes to assets/models/_compressed then replaces originals on success.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const modelsDir = path.join(root, 'assets', 'models');
const outDir = path.join(modelsDir, '_compressed');
const cli = path.join(root, 'node_modules', '@gltf-transform', 'cli', 'bin', 'cli.js');

if (!fs.existsSync(cli)) {
  console.error('Missing @gltf-transform/cli. Run: npm install');
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

const files = fs.readdirSync(modelsDir).filter((f) => f.endsWith('.glb'));
if (!files.length) {
  console.error('No .glb files found in', modelsDir);
  process.exit(1);
}

let saved = 0;
let beforeTotal = 0;
let afterTotal = 0;

for (const file of files) {
  const input = path.join(modelsDir, file);
  const output = path.join(outDir, file);
  const before = fs.statSync(input).size;
  beforeTotal += before;

  try {
    execFileSync(
      process.execPath,
      [
        cli,
        'optimize',
        input,
        output,
        '--compress',
        'draco',
        '--texture-compress',
        'webp',
        '--texture-size',
        '2048'
      ],
      { stdio: 'inherit' }
    );
  } catch (err) {
    // Fallback: Draco only (no texture recompress) if optimize fails
    console.warn(`[fallback] optimize failed for ${file}, trying draco only…`);
    try {
      execFileSync(
        process.execPath,
        [cli, 'draco', input, output],
        { stdio: 'inherit' }
      );
    } catch (err2) {
      console.error(`FAILED ${file}:`, err2.message);
      continue;
    }
  }

  if (!fs.existsSync(output)) {
    console.error(`No output for ${file}`);
    continue;
  }

  const after = fs.statSync(output).size;
  afterTotal += after;
  const ratio = ((1 - after / before) * 100).toFixed(1);
  console.log(`${file}: ${(before / 1e6).toFixed(1)}MB → ${(after / 1e6).toFixed(1)}MB (${ratio}% smaller)`);

  // Only replace if smaller or similar (never grow dramatically without benefit)
  if (after <= before * 1.05) {
    fs.copyFileSync(output, input);
    saved += before - after;
  } else {
    console.warn(`  skipped replace (output larger): ${file}`);
  }
}

console.log('---');
console.log(
  `Total: ${(beforeTotal / 1e6).toFixed(1)}MB → ${(afterTotal / 1e6).toFixed(1)}MB (saved ~${(saved / 1e6).toFixed(1)}MB on disk)`
);
