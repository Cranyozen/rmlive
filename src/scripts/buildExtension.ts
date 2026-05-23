/// <reference types="node" />

import { execSync } from 'node:child_process';
import { copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');

const run = (cmd: string) => execSync(cmd, { cwd: root, stdio: 'inherit' });

console.log('🔧 Building RMLive browser extension...\n');

// 1. Build main Vue app to dist-extension/ (no PWA, relative base)
console.log('📦 Step 1/3: Building main app...');
run('cross-env VITE_BUILD_TARGET=extension VITE_LIVEJSON_PROXY=https://rm-static.djicdn.com/live_json vite build --mode extension');

// 2. Build content script (iframe-inject.ts) to dist-extension/
console.log('\n📦 Step 2/3: Building content script...');
run('cross-env VITE_BUILD_IFRAME=true VITE_BUILD_TARGET=extension vite build --mode iframe');

// 3. Copy manifest.json and options page
console.log('\n📦 Step 3/3: Copying manifest.json and options page...');
const manifestSrc = path.join(root, 'src/extension/manifest.json');
const manifestDst = path.join(root, 'dist-extension/manifest.json');
copyFileSync(manifestSrc, manifestDst);

const optionsSrc = path.join(root, 'src/extension/options.html');
const optionsDst = path.join(root, 'dist-extension/options.html');
copyFileSync(optionsSrc, optionsDst);

const popupSrc = path.join(root, 'src/extension/popup.html');
const popupDst = path.join(root, 'dist-extension/popup.html');
copyFileSync(popupSrc, popupDst);

const popupJsSrc = path.join(root, 'src/extension/popup.js');
const popupJsDst = path.join(root, 'dist-extension/popup.js');
copyFileSync(popupJsSrc, popupJsDst);

const optionsJsSrc = path.join(root, 'src/extension/options.js');
const optionsJsDst = path.join(root, 'dist-extension/options.js');
copyFileSync(optionsJsSrc, optionsJsDst);

console.log('\n✅ Browser extension built to dist-extension/');
console.log('   Load dist-extension/ as an unpacked extension in Chrome (Developer mode).');
