#!/usr/bin/env bash
set -euo pipefail

: "${CLOUDFLARE_WORKER_NAME:?Set CLOUDFLARE_WORKER_NAME in Workers Builds}"
: "${CLOUDFLARE_ZONE_NAME:?Set CLOUDFLARE_ZONE_NAME in Workers Builds}"
: "${CLOUDFLARE_PATH_SEGMENT:?Set CLOUDFLARE_PATH_SEGMENT in Workers Builds}"
if [[ ! "$CLOUDFLARE_PATH_SEGMENT" =~ ^[a-zA-Z0-9_-]+$ ]]; then
  echo "CLOUDFLARE_PATH_SEGMENT must be a single path segment."
  exit 1
fi

mkdir -p .local/deploy-site
mv .local/webgpu-site ".local/deploy-site/$CLOUDFLARE_PATH_SEGMENT"

node <<'JS'
const { readFileSync, writeFileSync } = require('node:fs');
const config = JSON.parse(readFileSync('wrangler.jsonc.template', 'utf8'));
const zone = process.env.CLOUDFLARE_ZONE_NAME;
const base = zone + '/' + process.env.CLOUDFLARE_PATH_SEGMENT;

config.name = process.env.CLOUDFLARE_WORKER_NAME;
config.workers_dev = false;
config.preview_urls = false;
config.assets.directory = './.local/deploy-site';
config.routes = [base, base + '/*'].map(pattern => ({ pattern, zone_name: zone }));
writeFileSync('wrangler.jsonc', JSON.stringify(config, null, 2) + '\n');
JS

pnpm dlx wrangler@4.153.0 deploy --config wrangler.jsonc
