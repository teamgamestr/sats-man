#!/bin/sh
# Atomic build: assemble the site in dist.new and swap it in only once the
# whole build has succeeded. An interrupted build (a reboot, a killed process)
# then leaves the previous dist/ serving instead of a half-written tree.
set -eu
cd "$(dirname "$0")/.."

NEW=dist.new
OLD=dist.old
rm -rf "$NEW" "$OLD"

vite build --outDir "$NEW" --emptyOutDir -l error
cp "$NEW/index.html" "$NEW/404.html"

if [ -d dist ]; then mv dist "$OLD"; fi
mv "$NEW" dist
rm -rf "$OLD"

echo 'Project built successfully!'
