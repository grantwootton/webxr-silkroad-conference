#!/usr/bin/env node
/**
 * Compress all scene GLBs with Draco + WebP via @gltf-transform/cli.
 * Delegates to scripts/optimize-models.js (root + every scene folder).
 */
require('./optimize-models.js');
