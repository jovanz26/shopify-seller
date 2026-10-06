// Applies drafts/products.json to the store and creates the smart collections.
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
const { access_token } = await tokenRes.json();

async function gql(query, variables) {
  const res = await fetch(`https://${store}/admin/api/2026-10/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": access_token },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

const drafts = JSON.parse(readFileSync(join(root, "drafts/products.json"), "utf8"));

for (const d of drafts) {
  const r = await gql(
    `mutation($product: ProductUpdateInput!) {
      productUpdate(product: $product) { product { title handle } userErrors { field message } }
    }`,
    {
      product: {
        id: d.id,
        title: d.title,
        handle: d.handle,
        redirectNewHandle: true,
        descriptionHtml: d.descriptionHtml,
        productType: d.productType,
        tags: d.tags,
        seo: d.seo,
      },
    },
  );
  const out = r.data?.productUpdate;
  const errs = r.errors ?? out?.userErrors;
  console.log(errs?.length ? `ERROR ${d.title}: ${JSON.stringify(errs)}` : `ok  ${out.product.title} -> /products/${out.product.handle}`);
}

const collections = [
  { title: "Home Gym", type: "Home Gym Equipment" },
  { title: "Fitness Accessories", type: "Fitness Accessories" },
  { title: "Beauty & Wellness", type: "Beauty & Wellness" },
];
for (const c of collections) {
  const r = await gql(
    `mutation($input: CollectionInput!) {
      collectionCreate(input: $input) { collection { id title handle productsCount { count } } userErrors { field message } }
    }`,
    {
      input: {
        title: c.title,
        ruleSet: { appliedDisjunctively: false, rules: [{ column: "TYPE", relation: "EQUALS", condition: c.type }] },
      },
    },
  );
  const out = r.data?.collectionCreate;
  const errs = r.errors ?? out?.userErrors;
  console.log(errs?.length ? `ERROR ${c.title}: ${JSON.stringify(errs)}` : `ok  collection ${out.collection.title} (${out.collection.id})`);
}
