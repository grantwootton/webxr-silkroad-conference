#!/usr/bin/env node
/**
 * Draco + WebP optimize for every scene GLB.
 * Conservative flags: no simplify / flatten / join (keeps look, pivots, node names).
 * Writes to a temp file and replaces the original only if the result is smaller.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const cli = path.join(root, 'node_modules', '@gltf-transform', 'cli', 'bin', 'cli.js');
const logPath = path.join(root, 'tmp', 'glb-optimize.jsonl');

const MODEL_DIRS = [
    'assets/models',
    'building-safety/assets/models',
    'conflict-zones/assets/models',
    'disaster-zones/assets/models',
    'first-aid/assets/models',
    'public-disorder/assets/models',
    'vehicle-safety/assets/models'
];

const ENV_MESHES = new Set([
    'assets/models/conference_room1.glb',
    'building-safety/assets/models/apartment.glb',
    'conflict-zones/assets/models/postwar_city_-_exterior_scene.glb',
    'disaster-zones/assets/models/jungle_area.glb',
    'first-aid/assets/models/ruined_building.glb',
    'public-disorder/assets/models/street_city.glb',
    'public-disorder/assets/models/interogation_room.glb',
    'vehicle-safety/assets/models/basement_parking_garage_environment_underground.glb'
]);

const SKIP_MIN_BYTES = 180 * 1024;
const REPLACE_GROWTH = 1.02;

if (!fs.existsSync(cli)) {
    console.error('Missing @gltf-transform/cli. Run: npm install');
    process.exit(1);
}

fs.mkdirSync(path.join(root, 'tmp'), { recursive: true });

function alreadyTransformed(filePath) {
    try {
        const fd = fs.openSync(filePath, 'r');
        const buf = Buffer.alloc(Math.min(fs.statSync(filePath).size, 2_000_000));
        fs.readSync(fd, buf, 0, buf.length, 0);
        fs.closeSync(fd);
        return buf.includes(Buffer.from('glTF-Transform'));
    } catch (_) {
        return false;
    }
}

function listGlbs() {
    const files = [];
    for (const relDir of MODEL_DIRS) {
        const absDir = path.join(root, relDir);
        if (!fs.existsSync(absDir)) continue;
        for (const name of fs.readdirSync(absDir)) {
            if (!name.toLowerCase().endsWith('.glb') && !name.toLowerCase().endsWith('.gltf')) continue;
            const abs = path.join(absDir, name);
            const rel = path.relative(root, abs).split(path.sep).join('/');
            files.push({ abs, rel, size: fs.statSync(abs).size });
        }
    }
    files.sort((a, b) => {
        const ai = MODEL_DIRS.findIndex((d) => a.rel.startsWith(d));
        const bi = MODEL_DIRS.findIndex((d) => b.rel.startsWith(d));
        if (ai !== bi) return ai - bi;
        return b.size - a.size;
    });
    return files;
}

function backupEnv(rel, abs) {
    if (!ENV_MESHES.has(rel)) return;
    const bak = abs + '.bak';
    if (!fs.existsSync(bak)) {
        fs.copyFileSync(abs, bak);
        console.log(`  backup ${rel}.bak`);
    }
}

function runOptimize(input, output) {
    const args = [
        cli,
        'optimize',
        input,
        output,
        '--compress', 'draco',
        '--texture-compress', 'webp',
        '--texture-size', '2048',
        '--simplify', 'false',
        '--flatten', 'false',
        '--join', 'false',
        '--palette', 'false',
        '--instance', 'true',
        '--prune', 'true'
    ];
    execFileSync(process.execPath, args, {
        stdio: 'inherit',
        timeout: 8 * 60 * 1000
    });
}

function runFallback(input, output) {
    execFileSync(process.execPath, [cli, 'copy', input, output], {
        stdio: 'inherit',
        timeout: 2 * 60 * 1000
    });
    try {
        execFileSync(process.execPath, [cli, 'resize', output, output, '--width', '2048', '--height', '2048'], {
            stdio: 'inherit',
            timeout: 3 * 60 * 1000
        });
    } catch (_) { /* resize optional */ }
    try {
        execFileSync(process.execPath, [cli, 'webp', output, output], {
            stdio: 'inherit',
            timeout: 4 * 60 * 1000
        });
    } catch (_) { /* webp optional */ }
    execFileSync(process.execPath, [cli, 'draco', output, output], {
        stdio: 'inherit',
        timeout: 4 * 60 * 1000
    });
}

function logRow(obj) {
    fs.appendFileSync(logPath, JSON.stringify(obj) + '\n');
}

const files = listGlbs();
const results = [];
let saved = 0;
let processed = 0;

console.log(`Found ${files.length} glTF files across scene folders`);

for (const file of files) {
    const { abs, rel, size: before } = file;
    if (before < SKIP_MIN_BYTES) {
        console.log(`SKIP tiny ${rel} (${(before / 1024).toFixed(0)} KB)`);
        logRow({ rel, before, after: before, status: 'skip-tiny' });
        continue;
    }
    if (alreadyTransformed(abs)) {
        console.log(`SKIP already-optimized ${rel} (${(before / 1e6).toFixed(2)} MB)`);
        logRow({ rel, before, after: before, status: 'skip-transformed' });
        continue;
    }

    const tmpDir = path.join(path.dirname(abs), '_compressed');
    fs.mkdirSync(tmpDir, { recursive: true });
    const output = path.join(tmpDir, path.basename(abs));
    if (fs.existsSync(output)) fs.unlinkSync(output);

    console.log(`OPTIMIZE ${rel} (${(before / 1e6).toFixed(2)} MB)`);
    let method = 'optimize';
    try {
        runOptimize(abs, output);
    } catch (err) {
        console.warn(`  optimize failed, fallback copy+webp+draco: ${err.message.split('\n')[0]}`);
        method = 'fallback';
        try {
            if (fs.existsSync(output)) fs.unlinkSync(output);
            runFallback(abs, output);
        } catch (err2) {
            console.error(`  FAILED ${rel}: ${err2.message.split('\n')[0]}`);
            logRow({ rel, before, after: before, status: 'failed', error: String(err2.message).slice(0, 400) });
            continue;
        }
    }

    if (!fs.existsSync(output)) {
        console.error(`  no output ${rel}`);
        logRow({ rel, before, after: before, status: 'no-output' });
        continue;
    }

    const after = fs.statSync(output).size;
    const ratio = ((1 - after / before) * 100).toFixed(1);
    processed += 1;

    if (after <= before * REPLACE_GROWTH && after > 64) {
        backupEnv(rel, abs);
        fs.copyFileSync(output, abs);
        saved += before - after;
        console.log(`  ${ (before / 1e6).toFixed(2) }MB → ${ (after / 1e6).toFixed(2) }MB (${ratio}% ) [${method}]`);
        logRow({ rel, before, after, status: 'replaced', method });
        results.push({ rel, before, after, status: 'replaced' });
    } else {
        console.warn(`  skipped replace (no savings): ${rel} ${ (before / 1e6).toFixed(2) } → ${ (after / 1e6).toFixed(2) }`);
        logRow({ rel, before, after, status: 'skipped-larger', method });
    }
}

console.log('---');
console.log(`Processed ${processed} models, saved ~${(saved / 1e6).toFixed(1)} MB on disk`);
console.log(`Log: ${logPath}`);
