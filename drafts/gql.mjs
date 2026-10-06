// Runs a GraphQL document from stdin with a fresh token: node gql.mjs '{"var":1}' < query.graphql
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(join(root, ".env"), "utf8")
    .split("\n")
    .map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
const store = env.SHOPIFY_STORE;
const tokenRes = await fetch(`https://${store}/admin/oauth/access_token`, {
  method: "POST",
  body: new URLSearchParams({
    grant_type: "client_credentials",
    client_id: env.SHOPIFY_CLIENT_ID,
    client_secret: env.SHOPIFY_CLIENT_SECRET,
  }),
});
const { access_token, scope } = await tokenRes.json();
if (process.env.SHOW_SCOPE) console.error("scope:", scope);
const query = readFileSync(0, "utf8");
const variables = process.argv[2] ? JSON.parse(process.argv[2]) : undefined;
const res = await fetch(`https://${store}/admin/api/2026-10/graphql.json`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": access_token },
  body: JSON.stringify({ query, variables }),
});
const json = await res.json();
delete json.extensions;
console.log(JSON.stringify(json, null, 1));
