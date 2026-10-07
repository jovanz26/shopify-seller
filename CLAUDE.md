# shopify-seller

Herramientas para administrar la tienda Shopify **SIVORA** (`ryvydx-hj.myshopify.com`, USD, vende solo a EE. UU.) desde Claude Code. Dos personas trabajan en este repo, cada una con su propio Claude: lee esta guía completa antes de tocar la tienda.

## Primera vez en una máquina

```bash
./context.sh
```

Instala dependencias, crea `.env` a partir de `.env.example`, registra el servidor MCP `shopify` en Claude Code y prueba la conexión. Después hay que reiniciar Claude Code para que cargue las herramientas MCP.

Las credenciales (`SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`) **no están en el repo**: se comparten por un canal privado. Nunca las imprimas, las pegues en el chat ni las subas a git.

## Cómo se accede a la tienda

- App del Dev Dashboard llamada **"Claude"**, instalada en la tienda. El token se obtiene con el grant `client_credentials` (`/admin/oauth/access_token`) y dura 24 h; los scripts lo piden solos.
- Admin GraphQL API, versión **2026-10**.
- **MCP `shopify`** (`server.js`):
  - `shopify_query`: solo lectura; rechaza mutaciones.
  - `shopify_mutation`: cambia datos reales de la tienda.
- `drafts/gql.mjs`: ejecuta un documento GraphQL leído de stdin con un token nuevo. Úsalo cuando el MCP devuelva `ACCESS_DENIED` tras añadir alcances a la app, o para scripts:
  ```bash
  node drafts/gql.mjs '{"id":"gid://shopify/Product/123"}' <<'EOF'
  query($id: ID!) { product(id: $id) { title } }
  EOF
  ```
- Si falta un permiso, se agrega en el Dev Dashboard → app Claude → **Nueva versión** (las versiones lanzadas no se editan) → Lanzar → aprobar la actualización en la tienda.

## Reglas de trabajo

- **Confirma antes de cualquier mutación** que afecte a la tienda en vivo (productos, precios, envíos, tema, redirecciones) y verifica el resultado después, idealmente desde la tienda pública (`/products/<handle>.js`, `/cart/add.js`).
- **Tema en vivo**: antes de editar un archivo, guarda el original en `drafts/theme-backup/` y deja la versión nueva en `drafts/theme-new/`.
- No toques la app **PagePilot** ni la configuración de pagos, facturación o personal.
- Conversación con el equipo en **español**; el contenido de la tienda (títulos, descripciones, SEO) en **inglés**.
- Al cambiar el handle de un producto usa `redirectNewHandle: true` para no romper enlaces.

## AutoDS (dropshipping)

La tienda importa y sincroniza productos con AutoDS:

- AutoDS controla **precio y stock**. Los cambios de precio se hacen en la **regla de precios de AutoDS**: si se cambian en Shopify, AutoDS los sobrescribe.
- El stock real está en la ubicación **"AutoDS prod-…"** (fulfillment service), no en la dirección física.
- Los productos van en el perfil de envío **"AutoDS Free Shipping"** (zona EE. UU., tarifa $0, incluye las dos ubicaciones). Si un producto aparece "Agotado" teniendo stock, revisa primero ese perfil.
- Renombrar variantes puede afectar al vínculo con AutoDS: confírmalo en AutoDS después.

## Tema

Tienda renombrada a **Smashy** (squishy fidget toys, ambiente cozy: crema/durazno/lavanda, logo `smashy-logo.png`). Tema activo: "Smashy cozy" (copia de "Build Your Store Theme", que queda sin publicar como respaldo; fork de Dawn 15.2). Los círculos de color toman el color del alt de la imagen de la variante; se parcheó `snippets/swatch.liquid` para usar el nombre del valor (White, Black…) como color CSS, y los círculos miden 3.2rem (`assets/component-swatch-input.css`). Por eso las variantes de color deben llamarse con el nombre del color en inglés.

## Estructura

```
server.js                     servidor MCP
context.sh                    instalación en una máquina nueva
drafts/products.json          textos reescritos de los productos (fuente de drafts/apply.mjs)
drafts/apply.mjs              aplica products.json y crea las colecciones
drafts/publish-collections.mjs publica colecciones en la tienda online
drafts/gql.mjs                helper GraphQL con token nuevo
drafts/theme-backup|theme-new archivos del tema antes/después
```

## Git entre dos personas

- `git pull` antes de empezar. Trabaja en una rama (`git switch -c <tema>`) y abre un PR; no hagas push directo a `main`.
- Describe en el commit o PR **qué cambió en la tienda en vivo**, no solo en el código, para que el otro lo sepa.
- El repo es **público**: nada de secretos, costos de proveedor ni datos de clientes en commits.
