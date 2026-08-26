const UPSTREAM =
	"https://calendar.google.com/calendar/ical/leistungstag%40gmail.com/public/basic.ics";

const CORS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
	"Access-Control-Max-Age": "86400",
};

const FEED_HEADERS = {
	...CORS,
	"Content-Type": "text/calendar; charset=utf-8",
	"Content-Disposition": 'inline; filename="leistungstag.ics"',
	"Cache-Control": "public, max-age=300",
};

// Nominatim asks for a User-Agent that identifies the application and for at
// most one request per second. Both are honoured below; results are cached in
// KV so a steady state costs zero upstream lookups.
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "leistungstag.beer ICS proxy (https://www.leistungstag.beer)";
const GEOCODE_DELAY_MS = 1100;

const GEOCACHE_KEY = "geocache:v1";
// Kept small: this runs in waitUntil after the response is already sent, and a
// handful of page loads is enough to fill the cache for a new venue.
const LOOKUPS_PER_REQUEST = 3;
const LOOKUPS_PER_CRON = 40;
// An address that Nominatim cannot resolve is usually a typo in the calendar
// entry, so back off instead of retrying it on every single request.
const NEGATIVE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export default {
	async fetch(request, env, ctx) {
		if (request.method === "OPTIONS") {
			return new Response(null, { status: 204, headers: CORS });
		}

		if (request.method !== "GET" && request.method !== "HEAD") {
			return new Response("Method Not Allowed", {
				status: 405,
				headers: { ...CORS, Allow: "GET, HEAD, OPTIONS" },
			});
		}

		const upstream = await fetchUpstream();
		if (!upstream.ok) {
			return new Response("Upstream calendar unavailable", {
				status: 502,
				headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8" },
			});
		}

		const asCoords =
			new URL(request.url).searchParams.get("locationAsCoords") === "true";

		if (asCoords && !env.GEOCACHE) {
			return new Response(
				"locationAsCoords needs the GEOCACHE KV namespace; see cloudflare/ics-proxy/README.md",
				{
					status: 503,
					headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8" },
				},
			);
		}

		if (request.method === "HEAD") {
			return new Response(null, { status: 200, headers: FEED_HEADERS });
		}

		let feed = rename(await upstream.text());

		if (asCoords) {
			const cache = await readCache(env);
			// Collect the misses before rewriting: withCoordinates strips the
			// LOCATION of everything it cannot resolve, so afterwards there is
			// nothing left to look up.
			const missing = unresolved(feed, cache);
			feed = withCoordinates(feed, cache);

			if (missing.length > 0) {
				ctx.waitUntil(fillCache(env, missing.slice(0, LOOKUPS_PER_REQUEST)));
			}
		}

		return new Response(feed, { status: 200, headers: FEED_HEADERS });
	},

	// Keeps the geocode cache warm so a freshly added venue shows up on the map
	// without waiting for enough page loads to trickle through waitUntil.
	async scheduled(event, env, ctx) {
		if (!env.GEOCACHE) return;

		ctx.waitUntil(
			(async () => {
				const upstream = await fetchUpstream();
				if (!upstream.ok) return;

				const cache = await readCache(env);
				const missing = unresolved(await upstream.text(), cache);
				if (missing.length > 0) {
					await fillCache(env, missing.slice(0, LOOKUPS_PER_CRON));
				}
			})(),
		);
	},
};

function fetchUpstream() {
	// Google sends no-store; cache at the edge so calendar clients that poll
	// often do not hammer upstream.
	return fetch(UPSTREAM, { cf: { cacheTtl: 300, cacheEverything: true } });
}

// Google names the feed after the account, so subscribers would otherwise see
// "leistungstag@gmail.com" in their calendar list.
function rename(feed) {
	return feed
		.replace(/^X-WR-CALNAME:.*$/m, "X-WR-CALNAME:Leistungstag")
		.replace(/^X-WR-CALNAME:/m, "NAME:Leistungstag\r\nX-WR-CALNAME:");
}

/* -------------------------------------------------------------------------- */
/* ICS text handling                                                          */
/* -------------------------------------------------------------------------- */

function unfold(feed) {
	return feed.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
}

function fold(line) {
	const bytes = new TextEncoder().encode(line);
	if (bytes.length <= 75) return line;

	const decoder = new TextDecoder();
	const chunks = [];
	let start = 0;
	// Continuation lines spend one octet on their leading space.
	let limit = 75;

	while (start < bytes.length) {
		let end = Math.min(start + limit, bytes.length);
		// Never cut a UTF-8 sequence in half.
		while (end > start && end < bytes.length && (bytes[end] & 0xc0) === 0x80) {
			end--;
		}
		chunks.push(decoder.decode(bytes.slice(start, end)));
		start = end;
		limit = 74;
	}

	return chunks.join("\r\n ");
}

function unescapeIcsText(value) {
	return value
		.replace(/\\n/gi, "\n")
		.replace(/\\([,;\\])/g, "$1")
		.trim();
}

function locationOf(line) {
	const match = line.match(/^LOCATION(?:;[^:]*)?:(.*)$/);
	return match ? unescapeIcsText(match[1]) : null;
}

/**
 * Rewrites every LOCATION to "<lat> <lng>", which is the shape the map on
 * leistungstag.beer expects. Addresses that are not in the cache yet lose their
 * LOCATION entirely — the map skips those events rather than plotting NaN.
 */
function withCoordinates(feed, cache) {
	return unfold(feed)
		.split("\n")
		.map((line) => {
			const address = locationOf(line);
			if (address === null) return fold(line);

			const hit = cache[address];
			if (!hit || typeof hit.lat !== "number") return null;

			return `LOCATION:${hit.lat} ${hit.lon}`;
		})
		.filter((line) => line !== null)
		.join("\r\n");
}

function addressesIn(feed) {
	const seen = new Set();
	for (const line of unfold(feed).split("\n")) {
		const address = locationOf(line);
		if (address) seen.add(address);
	}
	return [...seen];
}

function unresolved(feed, cache) {
	const now = Date.now();
	return addressesIn(feed).filter((address) => {
		const hit = cache[address];
		if (!hit) return true;
		if (typeof hit.lat === "number") return false;
		return now - (hit.failedAt ?? 0) > NEGATIVE_TTL_MS;
	});
}

/* -------------------------------------------------------------------------- */
/* Geocoding                                                                  */
/* -------------------------------------------------------------------------- */

async function readCache(env) {
	return (await env.GEOCACHE.get(GEOCACHE_KEY, "json")) ?? {};
}

async function fillCache(env, addresses) {
	const resolved = {};

	for (const [index, address] of addresses.entries()) {
		if (index > 0) await sleep(GEOCODE_DELAY_MS);
		const hit = await geocode(address);
		resolved[address] = hit ?? { failedAt: Date.now() };
	}

	// Re-read rather than reusing the snapshot the request started with, so a
	// concurrent fill of a different address is not thrown away.
	const cache = await readCache(env);
	await env.GEOCACHE.put(
		GEOCACHE_KEY,
		JSON.stringify({ ...cache, ...resolved }),
	);
}

async function geocode(address) {
	const url = new URL(NOMINATIM);
	url.searchParams.set("format", "jsonv2");
	url.searchParams.set("limit", "1");
	url.searchParams.set("q", address);

	const response = await fetch(url, {
		headers: { "User-Agent": USER_AGENT, "Accept-Language": "de" },
	});
	if (!response.ok) return null;

	const hits = await response.json();
	if (!Array.isArray(hits) || hits.length === 0) return null;

	const lat = Number.parseFloat(hits[0].lat);
	const lon = Number.parseFloat(hits[0].lon);
	return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
