# License Worker (Cloudflare) – Hardened + Env Config

Worker validasi lisensi template + CORS.  
Config (license, gambar iklan, URL iklan) sekarang dari **environment variables**.

## Environment Variables

| Variable          | Keterangan                          | Contoh                                      |
|-------------------|-------------------------------------|---------------------------------------------|
| `LICENSE_DOMAIN`  | Domain lisensi (tanpa https://)     | `daffadevhosting.github.io`                       |
| `ADS_IMAGE`       | URL gambar iklan (fallback)         | `https://.../promo.jpg`                     |
| `ADS_LINK`        | URL tujuan iklan (fallback)         | `https://.../promo`                         |

### Cara set

**1. Local development** — edit file `.dev.vars` (seperti `.env`):

```bash
LICENSE_DOMAIN=daffadevhosting.github.io
ADS_IMAGE=https://contoh.com/gambar.jpg
ADS_LINK=https://contoh.com/promo
```

**2. Production** — edit di `wrangler.toml` bagian `[vars]`, atau lewat Dashboard:

```
Cloudflare Dashboard → Workers & Pages → license-worker → Settings → Variables
```

Atau via CLI:

```bash
npx wrangler secret put LICENSE_DOMAIN   # jika ingin secret
# atau cukup edit [vars] di wrangler.toml lalu deploy ulang
```

## Endpoint

| Path                    | Keterangan                          |
|-------------------------|-------------------------------------|
| `/check`                | API validasi (JSON)                 |
| `/core.js`              | Script utama (disarankan)           |
| `/license.js`           | Alias                               |
| `/assets/core.min.js`   | Alias menyamar                      |

## Deploy

```bash
cd license-worker
npx wrangler login
npx wrangler deploy
```

## Cara pakai di HTML / Blogspot

```html
<script src="https://app-core.<you-worker>>.workers.dev/assets/core.min.js"></script>
```

### Meta (tetap didukung)

```html
<meta name="license" content="https://daffadevhosting.github.io">
<meta name="ads-image" content="URL_GAMBAR">
<meta name="ads-link" content="URL_LINK">
```

- **Prioritas iklan**: meta tag → fallback dari env (`ADS_IMAGE` / `ADS_LINK`)
- Footer harus mengandung domain lisensi

## File penting

- `wrangler.toml` → `[vars]` production
- `.dev.vars` → local (jangan commit)
- `.env.example` → template
