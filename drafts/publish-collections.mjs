// Publishes the given collections to the Online Store sales channel.
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
console.log("scope:", scope);

async function gql(query, variables) {
  const res = await fetch(`https://${store}/admin/api/2026-10/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": access_token },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

const pubs = await gql(`{ publications(first: 20) { nodes { id name } } }`);
if (pubs.errors) throw new Error(JSON.stringify(pubs.errors));
console.log("publications:", pubs.data.publications.nodes.map((p) => p.name).join(", "));
const onlineStore = pubs.data.publications.nodes.find((p) => p.name === "Online Store" || p.name === "Tienda online");
if (!onlineStore) throw new Error("No se encontró el canal Online Store");

const handles = process.argv.slice(2);
for (const handle of handles) {
  const c = await gql(`query($h: String!) { collectionByHandle(handle: $h) { id title } }`, { h: handle });
  const col = c.data?.collectionByHandle;
  if (!col) {
    console.log(`ERROR no existe la colección ${handle}`);
    continue;
  }
  const r = await gql(
    `mutation($id: ID!, $input: [PublicationInput!]!) {
      publishablePublish(id: $id, input: $input) { userErrors { field message } }
    }`,
    { id: col.id, input: [{ publicationId: onlineStore.id }] },
  );
  const errs = r.errors ?? r.data?.publishablePublish?.userErrors;
  console.log(errs?.length ? `ERROR ${col.title}: ${JSON.stringify(errs)}` : `ok  ${col.title} publicada`);
}
