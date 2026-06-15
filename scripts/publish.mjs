#!/usr/bin/env node

/**
 * Web2md Chrome Web Store publish helper.
 *
 * Usage:
 *   node scripts/publish.mjs                          # patch bump, zip, no tag
 *   node scripts/publish.mjs --minor                  # minor bump
 *   node scripts/publish.mjs --major --tag            # major bump + git tag
 *   node scripts/publish.mjs --reset                  # reset version to original
 *   node scripts/publish.mjs --tag --no-bump          # tag only, no version bump
 *
 * Flags:
 *   --patch      Increment patch version (default)
 *   --minor      Increment minor version
 *   --major      Increment major version
 *   --tag        Create a git tag for the release
 *   --no-bump    Skip version bump (use with --tag)
 *   --reset      Restore manifest.json to pre-publish version
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MANIFEST_PATH = join(ROOT, 'manifest.json');

// ── Parse args ─────────────────────────────────────────────────────────────

const args = new Set(process.argv.slice(2));
const bumpType = args.has('--major') ? 'major' : args.has('--minor') ? 'minor' : 'patch';
const doTag = args.has('--tag');
const noBump = args.has('--no-bump');
const doReset = args.has('--reset');

// ── Read manifest ──────────────────────────────────────────────────────────

function readManifest() {
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
}

function writeManifest(manifest) {
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
}

// ── Version helpers ────────────────────────────────────────────────────────

function parseVersion(v) {
  return v.split('.').map(Number);
}

function formatVersion(parts) {
  return parts.join('.');
}

function bumpVersion(version, type) {
  const parts = parseVersion(version);
  if (type === 'major') { parts[0]++; parts[1] = 0; parts[2] = 0; }
  else if (type === 'minor') { parts[1]++; parts[2] = 0; }
  else { parts[2]++; }
  return formatVersion(parts);
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const manifest = readManifest();
  const originalVersion = manifest.version;

  if (doReset) {
    // Restore original version (revert the bump)
    const savedPath = MANIFEST_PATH + '.bak';
    try {
      const saved = JSON.parse(readFileSync(savedPath, 'utf-8'));
      manifest.version = saved.version;
      writeManifest(manifest);
      console.log(`\u2705 Reset version to ${manifest.version} (restored from manifest.json.bak)`);
    } catch {
      console.error('\u274C No backup file found (manifest.json.bak). Cannot reset.');
      process.exit(1);
    }
    return;
  }

  // 1. Bump version
  const newVersion = noBump ? originalVersion : bumpVersion(originalVersion, bumpType);

  if (!noBump && newVersion !== originalVersion) {
    // Save backup for --reset
    writeFileSync(MANIFEST_PATH + '.bak', JSON.stringify({ version: originalVersion }) + '\n', 'utf-8');
    manifest.version = newVersion;
    writeManifest(manifest);
    console.log(`\u2705 Version bumped: ${originalVersion} \u2192 ${newVersion}\n`);
  } else {
    console.log(`\u2139 Version unchanged: ${newVersion}\n`);
  }

  // 2. Create zip
  const extName = manifest.name.toLowerCase().replace(/\s+/g, '-');
  const zipName = `${extName}-v${newVersion}.zip`;
  const zipPath = join(ROOT, zipName);
  // Files to exclude from zip
  const exclude = [
    '.git/*',
    '.gitignore',
    'node_modules/*',
    'test/*',
    'store-assets/*',
    'scripts/*',
    'ANNG.md',
    'README.md',
    'LICENSE',
    'package.json',
    'package-lock.json',
  ].map(p => `-x "${p}"`).join(' ');

  const cmd = `cd "${ROOT}" && zip -r "${zipPath}" . ${exclude}`;
  console.log(`\ud83d\udce6 Creating zip: ${zipName}`);
  execSync(cmd, { stdio: 'inherit' });
  console.log(`\u2705 Created: ${zipPath}\n`);

  // 3. Optional git tag
  if (doTag) {
    const tagName = `v${newVersion}`;
    try {
      execSync(`git tag "${tagName}"`, { cwd: ROOT, stdio: 'inherit' });
      console.log(`\u2705 Git tag created: ${tagName}`);
      console.log('   To push: git push origin --tags');
    } catch (err) {
      console.error(`\u274C Failed to create git tag: ${err.message}`);
      process.exit(1);
    }
  }

  console.log(`\n\u2728 Publish ready: ${zipName}`);
  console.log('   Upload this file to the Chrome Web Store Developer Dashboard.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
