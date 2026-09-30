# ics.leistungstag.beer

Cloudflare Worker that serves the public Google Calendar ICS feed
(`leistungstag@gmail.com`) under our own domain.

Proxy instead of a 301/302 redirect, because:

- browsers drop CORS on cross-origin redirects, and the site fetches the feed
  with `fetch()` — Google's ICS endpoint sends no `Access-Control-Allow-Origin`
- the URL stays ours if the calendar backend changes again
- Google names the feed after the account, so subscribers would see
  `leistungstag@gmail.com` in their calendar list; the Worker rewrites it

## `?locationAsCoords=true`

The Leistungskarte needs `LOCATION` to be `"<lat> <lng>"`, which is what the old
Leistungsbot feed emitted. Google Calendar stores postal addresses instead, so
the Worker geocodes them via [Nominatim](https://nominatim.openstreetmap.org)
and caches the results in KV under a single `geocache:v1` key.

Lookups never block a response: misses are geocoded in `waitUntil` (3 per
request) and by a nightly cron (40 per run), so a new venue appears on the map
within a few page loads at worst. Events whose address is not resolved yet are
served without a `LOCATION` and skipped by `map.js` — no `NaN` markers.

Nominatim's usage policy is respected: identifying `User-Agent`, at most one
request per second, and cached results so the steady state costs no lookups.

## Deploy

```sh
npx wrangler login                      # once
npx wrangler kv namespace create GEOCACHE
```

Put the printed id into `kv_namespaces[0].id` in `wrangler.jsonc`, then:

```sh
npx wrangler deploy                     # from this directory
```

`wrangler.jsonc` claims `ics.leistungstag.beer` as a Workers custom domain,
which replaces the existing DNS record for that hostname.

## Verify

```sh
curl -sI https://ics.leistungstag.beer | grep -i 'access-control\|content-type'
curl -s https://ics.leistungstag.beer | head -5
curl -s 'https://ics.leistungstag.beer/?locationAsCoords=true' | grep -m3 '^LOCATION:'
```

The last command should print coordinate pairs. Right after the first deploy the
cache is empty, so give the cron a night — or hit the URL a few dozen times — to
fill it.
