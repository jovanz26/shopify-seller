#!/usr/bin/env node
// MCP server for the SIVORA Shopify store (Admin GraphQL API).
// Credentials come from .env next to this file; the access token is obtained
// with the client_credentials grant and refreshed before it expires.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_VERSION = "2026-10";
const here = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const env = {};
  for (const line of readFileSync(join(here, ".env"), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

const { SHOPIFY_STORE, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET } = loadEnv();
if (!SHOPIFY_STORE || !SHOPIFY_CLIENT_ID || !SHOPIFY_CLIENT_SECRET) {
  console.error("Faltan SHOPIFY_STORE, SHOPIFY_CLIENT_ID o SHOPIFY_CLIENT_SECRET en .env");
  process.exit(1);
}

let token = null;
let tokenExpiresAt = 0;

async function getToken() {
  if (token && Date.now() < tokenExpiresAt - 5 * 60_000) return token;
  const res = await fetch(`https://${SHOPIFY_STORE}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: SHOPIFY_CLIENT_ID,
      client_secret: SHOPIFY_CLIENT_SECRET,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    const title = text.match(/<title>(.*?)<\/title>/)?.[1];
    throw new Error(`No se pudo obtener el token (${res.status}): ${title || text.slice(0, 300)}`);
  }
  const json = JSON.parse(text);
  token = json.access_token;
  tokenExpiresAt = Date.now() + (json.expires_in ?? 3600) * 1000;
  return token;
}

async function graphql(query, variables, retried = false) {
  const call = async () =>
    fetch(`https://${SHOPIFY_STORE}/admin/api/${API_VERSION}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": await getToken() },
      body: JSON.stringify({ query, variables }),
    });
  let res = await call();
  if (res.status === 401) {
    token = null;
    res = await call();
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`Shopify respondió ${res.status}: ${text.slice(0, 1000)}`);
  const json = JSON.parse(text);
  // A cached token keeps the scopes it was issued with; after the app gains
  // scopes, retry once with a fresh token before reporting ACCESS_DENIED.
  if (!retried && json.errors?.some((e) => e.extensions?.code === "ACCESS_DENIED")) {
    token = null;
    return graphql(query, variables, true);
  }
  return json;
}

const isMutation = (q) => /^\s*(#[^\n]*\n\s*)*mutation\b/.test(q);

function result(data) {
  const isError = Boolean(data.errors?.length);
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], isError };
}

const server = new McpServer({ name: "shopify-sivora", version: "1.0.0" });

const inputSchema = {
  query: z.string().describe("Documento GraphQL de la Admin API de Shopify"),
  variables: z.record(z.string(), z.any()).optional().describe("Variables de la operación"),
};

server.registerTool(
  "shopify_query",
  {
    title: "Consultar Shopify",
    description: `Ejecuta una consulta (solo lectura) contra la Admin GraphQL API ${API_VERSION} de la tienda ${SHOPIFY_STORE}. Rechaza mutaciones; para cambios usa shopify_mutation.`,
    inputSchema,
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ query, variables }) => {
    if (isMutation(query)) throw new Error("Esto es una mutación; usa shopify_mutation.");
    return result(await graphql(query, variables));
  },
);

server.registerTool(
  "shopify_mutation",
  {
    title: "Modificar Shopify",
    description: `Ejecuta una mutación contra la Admin GraphQL API ${API_VERSION} de la tienda ${SHOPIFY_STORE}. Modifica datos reales de la tienda.`,
    inputSchema,
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  },
  async ({ query, variables }) => {
    if (!isMutation(query)) throw new Error("Esto no es una mutación; usa shopify_query.");
    return result(await graphql(query, variables));
  },
);

await server.connect(new StdioServerTransport());
