#!/usr/bin/env sh
set -eu

mkdir -p dist/icons
cp index.html dist/index.html
cp styles.css dist/styles.css
cp app.js dist/app.js
cp manifest.webmanifest dist/manifest.webmanifest
cp service-worker.js dist/service-worker.js
cp icons/icon.svg dist/icons/icon.svg
