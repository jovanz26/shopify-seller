#!/usr/bin/env bash
# Prepares this repo on a new machine: deps, .env, MCP server in Claude Code, connection test.
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v node >/dev/null; then
  echo "Falta Node.js (18 o superior): https://nodejs.org" >&2
  exit 1
fi
if [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  echo "Se necesita Node.js 18 o superior (tienes $(node -v))." >&2
  exit 1
fi

echo "→ Instalando dependencias"
npm ci --silent

if [ ! -f .env ]; then
  cp .env.example .env
  chmod 600 .env
  echo "→ Creado .env: completa SHOPIFY_CLIENT_ID y SHOPIFY_CLIENT_SECRET (pídelos por un canal privado) y vuelve a correr ./context.sh"
  exit 0
fi

if grep -qE '^SHOPIFY_CLIENT_(ID|SECRET)=\s*$' .env; then
  echo "→ .env está incompleto: completa SHOPIFY_CLIENT_ID y SHOPIFY_CLIENT_SECRET y vuelve a correr ./context.sh"
  exit 1
fi

if command -v claude >/dev/null; then
  if claude mcp get shopify >/dev/null 2>&1; then
    echo "→ El servidor MCP 'shopify' ya está registrado en Claude Code"
  else
    claude mcp add -s user shopify -- node "$PWD/server.js"
    echo "→ Registrado el servidor MCP 'shopify'; reinicia Claude Code para cargarlo"
  fi
else
  echo "→ No se encontró el comando 'claude'; registra el MCP luego con:"
  echo "   claude mcp add -s user shopify -- node \"$PWD/server.js\""
fi

echo "→ Probando la conexión con la tienda"
node drafts/gql.mjs <<'EOF' | node -e '
let d = "";
process.stdin.on("data", (c) => (d += c)).on("end", () => {
  const j = JSON.parse(d);
  if (j.errors) { console.error("Error:", JSON.stringify(j.errors)); process.exit(1); }
  console.log(`✓ Conectado a ${j.data.shop.name} (${j.data.shop.myshopifyDomain}), ${j.data.productsCount.count} productos`);
});'
{ shop { name myshopifyDomain } productsCount { count } }
EOF
