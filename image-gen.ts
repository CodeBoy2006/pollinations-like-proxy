// image-gen.ts
import {
  Status,
  STATUS_TEXT,
} from "https://deno.land/std@0.208.0/http/status.ts";
import { parse } from "https://deno.land/std@0.208.0/flags/mod.ts";
import { ensureDir } from "https://deno.land/std@0.208.0/fs/ensure_dir.ts";
import { join } from "https://deno.land/std@0.208.0/path/mod.ts";
import { load } from "https://deno.land/std@0.208.0/dotenv/mod.ts";
await load({ export: true });

const args = parse(Deno.args, {
  string: [
    "backends", "port", "token", "cache-dir", "proxy-key",
    "image-hosting-provider",
    "image-hosting-key",        // API key for providers like SM.MS, PicGo
    "image-hosting-url",        // API endpoint for PicGo, Cloudflare Imgbed
    "image-hosting-auth-code",  // Auth code for Cloudflare Imgbed
  ],
  boolean: ["image-hosting-enabled"],
  default: {
    port: "8080",
    "cache-dir": "./image_file_cache",
    "image-hosting-enabled": false,
  },
});

const BACKEND_API_URLS_RAW = args.backends || Deno.env.get("BACKEND_API_URLS");
const PORT = parseInt(args.port || Deno.env.get("PORT") || "8080", 10);
const AUTH_TOKEN = args.token || Deno.env.get("AUTH_TOKEN");
const CACHE_DIR = args["cache-dir"] || Deno.env.get("CACHE_DIR");
const PROXY_ACCESS_KEY = args["proxy-key"] || Deno.env.get("PROXY_ACCESS_KEY");

const IMAGE_HOSTING_ENABLED = args["image-hosting-enabled"] || (Deno.env.get("IMAGE_HOSTING_ENABLED") === "true");
const IMAGE_HOSTING_PROVIDER = args["image-hosting-provider"] || Deno.env.get("IMAGE_HOSTING_PROVIDER");
const IMAGE_HOSTING_KEY = args["image-hosting-key"] || Deno.env.get("IMAGE_HOSTING_KEY");
const IMAGE_HOSTING_URL = args["image-hosting-url"] || Deno.env.get("IMAGE_HOSTING_URL");
const IMAGE_HOSTING_AUTH_CODE = args["image-hosting-auth-code"] || Deno.env.get("IMAGE_HOSTING_AUTH_CODE");

if (!BACKEND_API_URLS_RAW) { console.error("FATAL: Backend API URLs are not set via --backends or BACKEND_API_URLS."); Deno.exit(1); }
const BACKEND_API_URLS = BACKEND_API_URLS_RAW.split(",").map((url) => url.trim()).filter(Boolean);
if (BACKEND_API_URLS.length === 0) { console.error("FATAL: No valid backend API URLs found."); Deno.exit(1); }
if (!PROXY_ACCESS_KEY) { console.error("FATAL: Proxy access key is not set via --proxy-key or PROXY_ACCESS_KEY."); Deno.exit(1); }
if (!AUTH_TOKEN) { console.warn("WARNING: AUTH_TOKEN is not set. Requests to backends will be unauthenticated."); }

if (IMAGE_HOSTING_ENABLED) {
    if (!IMAGE_HOSTING_PROVIDER) { console.error("FATAL: Image Hosting is enabled, but provider is not set."); Deno.exit(1); }
    switch(IMAGE_HOSTING_PROVIDER) {
        case 'smms': if (!IMAGE_HOSTING_KEY) { console.error("FATAL: SM.MS provider requires an API key."); Deno.exit(1); } break;
        case 'picgo': if (!IMAGE_HOSTING_KEY || !IMAGE_HOSTING_URL) { console.error("FATAL: PicGo provider requires an API key and URL."); Deno.exit(1); } break;
        case 'cloudflare_imgbed': if (!IMAGE_HOSTING_URL) { console.error("FATAL: Cloudflare Imgbed provider requires a URL."); Deno.exit(1); } break;
        default: console.error(`FATAL: Unknown image hosting provider '${IMAGE_HOSTING_PROVIDER}'.`); Deno.exit(1);
    }
}

console.log("--- Proxy Configuration ---");
console.log(`Port: ${PORT}`);
console.log(`Backends: ${BACKEND_API_URLS.join(", ")}`);
console.log(`Image Hosting: ${IMAGE_HOSTING_ENABLED ? `Enabled (Provider: ${IMAGE_HOSTING_PROVIDER})` : 'Disabled'}`);
console.log(`Cache Mode: ${IMAGE_HOSTING_ENABLED ? 'Deno KV' : `File System (${CACHE_DIR})`}`);
console.log("--------------------------");

// Generates a hash key for a given image request.
async function generateCacheHash(description: string, width?: number, height?: number, model?: string, seed?: number): Promise<string> {
    const keyString = `${description.toLowerCase().trim()}|${width || "def"}|${height || "def"}|${model || "def"}|${seed || "def"}`;
    const data = new TextEncoder().encode(keyString);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

interface ImageUploader {
    upload(data: Uint8Array, filename: string): Promise<{ url: string } | null>;
}

class SmMsUploader implements ImageUploader {
    private static API_URL = "https://sm.ms/api/v2/upload";
    constructor(private apiKey: string) {}
    async upload(data: Uint8Array, filename: string): Promise<{ url: string } | null> {
        console.log(`[UPLOADER_SMMS] Uploading ${filename}...`);
        try {
            const formData = new FormData();
            formData.append("smfile", new Blob([data]), filename);
            const response = await fetch(SmMsUploader.API_URL, { method: "POST", headers: { 'Authorization': this.apiKey }, body: formData });
            const json = await response.json();
            if (!response.ok || !json.success) {
                console.error(`[UPLOADER_SMMS] Upload failed: ${json.message || 'Unknown error'}`);
                return null;
            }
            return json.data?.url ? { url: json.data.url } : null;
        } catch (e) { console.error(`[UPLOADER_SMMS] Request error:`, e); return null; }
    }
}

class PicGoUploader implements ImageUploader {
    constructor(private apiKey: string, private apiUrl: string) {}
    async upload(data: Uint8Array, filename: string): Promise<{ url: string } | null> {
        console.log(`[UPLOADER_PICGO] Uploading ${filename} to ${this.apiUrl}...`);
        try {
            const formData = new FormData();
            formData.append("source", new Blob([data]), filename);
            const response = await fetch(this.apiUrl, { method: "POST", headers: { 'X-API-Key': this.apiKey, 'Accept': 'application/json' }, body: formData });
            const json = await response.json();
            if (!response.ok || json.status_code !== 200) {
                console.error(`[UPLOADER_PICGO] Upload failed: ${json.error?.message || 'Unknown error'}`);
                return null;
            }
            return json.image?.url ? { url: json.image.url } : null;
        } catch (e) { console.error(`[UPLOADER_PICGO] Request error:`, e); return null; }
    }
}

class CloudflareImgbedUploader implements ImageUploader {
    constructor(private apiUrl: string, private authCode?: string) {}
    async upload(data: Uint8Array, filename: string): Promise<{ url: string } | null> {
        console.log(`[UPLOADER_CF] Uploading ${filename} to ${this.apiUrl}...`);
        try {
            const url = new URL(this.apiUrl);
            if (this.authCode) url.searchParams.set("authCode", this.authCode);
            const formData = new FormData();
            formData.append("file", new Blob([data]), filename);
            const response = await fetch(url.href, { method: "POST", body: formData });
            if (!response.ok) { console.error(`[UPLOADER_CF] Upload failed with status ${response.status}.`); return null; }
            const json = await response.json();
            const path = Array.isArray(json) ? json[0]?.src : null;
            return path ? { url: new URL(path, this.apiUrl).href } : null;
        } catch (e) { console.error(`[UPLOADER_CF] Request error:`, e); return null; }
    }
}

class ImageUploaderFactory {
    static create(): ImageUploader | null {
        if (!IMAGE_HOSTING_ENABLED) return null;
        switch (IMAGE_HOSTING_PROVIDER) {
            case 'smms': return new SmMsUploader(IMAGE_HOSTING_KEY!);
            case 'picgo': return new PicGoUploader(IMAGE_HOSTING_KEY!, IMAGE_HOSTING_URL!);
            case 'cloudflare_imgbed': return new CloudflareImgbedUploader(IMAGE_HOSTING_URL!, IMAGE_HOSTING_AUTH_CODE);
            default: return null;
        }
    }
}

let kv: Deno.Kv | null = null;
interface KvCacheEntry { hostedUrl: string; revisedPrompt?: string; }
async function getFromKvCache(hash: string): Promise<KvCacheEntry | null> { return kv ? (await kv.get<KvCacheEntry>(["images", hash])).value : null; }
async function addToKvCache(hash: string, hostedUrl: string, revisedPrompt?: string): Promise<void> { if (kv) { await kv.set(["images", hash], { hostedUrl, revisedPrompt }); console.log(`[CACHE_KV] Added: ${hash}`); } }
async function deleteFromKvCache(hash: string): Promise<boolean> { if (!kv) return false; const res = await kv.atomic().check({ key: ["images", hash], versionstamp: null }).delete(["images", hash]).commit(); return res.ok; }

interface FsCacheEntry { data: Uint8Array; contentType: string; revisedPrompt?: string; }
interface FsCacheMetadata { contentType: string; originalUrl: string; revisedPrompt?: string; createdAt: string; }
function getCacheFilePaths(hash: string) { return { dataPath: join(CACHE_DIR, `${hash}.data`), metaPath: join(CACHE_DIR, `${hash}.meta.json`) }; }
async function getFromFsCache(hash: string): Promise<FsCacheEntry | null> {
    const { dataPath, metaPath } = getCacheFilePaths(hash);
    try {
        const [metaStat, dataStat] = await Promise.all([ Deno.stat(metaPath).catch(() => null), Deno.stat(dataPath).catch(() => null) ]);
        if (!metaStat || !dataStat) return null;
        const metadata = JSON.parse(await Deno.readTextFile(metaPath)) as FsCacheMetadata;
        const data = await Deno.readFile(dataPath);
        return { data, contentType: metadata.contentType, revisedPrompt: metadata.revisedPrompt };
    } catch (e) { if (!(e instanceof Deno.errors.NotFound)) console.error(`[CACHE_FS] Read error for ${hash}:`, e); return null; }
}
async function addToFsCache(hash: string, data: Uint8Array, contentType: string, originalUrl: string, revisedPrompt?: string): Promise<void> {
    const { dataPath, metaPath } = getCacheFilePaths(hash);
    const metadata: FsCacheMetadata = { contentType, originalUrl, revisedPrompt, createdAt: new Date().toISOString() };
    try {
        await Promise.all([ Deno.writeFile(dataPath, data), Deno.writeTextFile(metaPath, JSON.stringify(metadata, null, 2)) ]);
        console.log(`[CACHE_FS] Added: ${hash}`);
    } catch (e) { console.error(`[CACHE_FS] Write error for ${hash}:`, e); }
}
async function deleteFromFsCache(hash: string): Promise<boolean> {
    const { dataPath, metaPath } = getCacheFilePaths(hash);
    const results = await Promise.allSettled([ Deno.remove(dataPath), Deno.remove(metaPath) ]);
    return results.some(r => r.status === 'fulfilled');
}

let currentBackendIndex = 0;
function getNextBackendUrl(): string { const url = BACKEND_API_URLS[currentBackendIndex]; currentBackendIndex = (currentBackendIndex + 1) % BACKEND_API_URLS.length; return url; }

async function generateImageFromBackend(description: string, width?: number, height?: number, model?: string, seed?: number): Promise<{ imageUrl: string; revisedPrompt?: string } | null> {
    const backendUrl = getNextBackendUrl();
    const requestUrl = `${backendUrl}/v1/images/generations`;
    const payload: Record<string, any> = { prompt: description, n: 1, seed: seed };
    if (model) payload.model = model;
    if (width && height) payload.size = `${width}x${height}`;
    console.log(`[BACKEND] Request to ${requestUrl} with seed ${seed}`);
    try {
        const headers: HeadersInit = { "Content-Type": "application/json", "Accept": "application/json" };
        if (AUTH_TOKEN) headers["Authorization"] = `Bearer ${AUTH_TOKEN}`;
        const res = await fetch(requestUrl, { method: "POST", headers, body: JSON.stringify(payload) });
        if (!res.ok) { console.error(`[BACKEND] Error: ${res.status} from ${requestUrl}`); return null; }
        const json = await res.json();
        const data = json.data?.[0];
        return data?.url ? { imageUrl: data.url, revisedPrompt: data.revised_prompt } : null;
    } catch (e) { console.error(`[BACKEND] Network error for ${requestUrl}:`, e); return null; }
}

async function fetchImageFromUrl(imageUrl: string): Promise<{ data: Uint8Array, contentType: string } | null> {
    try {
        const response = await fetch(imageUrl);
        if (!response.ok) { console.error(`[FETCH] Failed to fetch image from ${imageUrl}: ${response.status}`); return null; }
        const contentType = response.headers.get("content-type") || "image/png";
        const arrayBuffer = await response.arrayBuffer();
        return { data: new Uint8Array(arrayBuffer), contentType };
    } catch (e) { console.error(`[FETCH] Error fetching image data from ${imageUrl}:`, e); return null; }
}

async function handler(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pathSegments = url.pathname.split("/").filter(Boolean);

    // Image generation endpoint
    if (request.method === "GET" && pathSegments[0] === "prompt" && pathSegments.length > 1) {
        if (url.searchParams.get("key") !== PROXY_ACCESS_KEY) {
            return new Response("Unauthorized", { status: Status.Unauthorized });
        }
        const description = decodeURIComponent(pathSegments.slice(1).join("/"));
        const width = url.searchParams.get("width") ? parseInt(url.searchParams.get("width")!, 10) : undefined;
        const height = url.searchParams.get("height") ? parseInt(url.searchParams.get("height")!, 10) : undefined;
        const model = url.searchParams.get("model") || undefined;
        const seed = url.searchParams.has("seed") ? parseInt(url.searchParams.get("seed")!, 10) : 42;

        console.log(`[REQUEST] Prompt: "${description}", Seed: ${seed}`);
        const cacheHash = await generateCacheHash(description, width, height, model, seed);

        if (IMAGE_HOSTING_ENABLED) {
            const cached = await getFromKvCache(cacheHash);
            if (cached) { console.log(`[CACHE_KV] HIT: ${cacheHash}`); return Response.redirect(cached.hostedUrl, Status.Found); }
            console.log(`[CACHE_KV] MISS: ${cacheHash}`);
            const gen = await generateImageFromBackend(description, width, height, model, seed);
            if (!gen?.imageUrl) return new Response("Backend failed to generate image.", { status: Status.ServiceUnavailable });
            const img = await fetchImageFromUrl(gen.imageUrl);
            if (!img) return new Response("Failed to fetch image data.", { status: Status.BadGateway });
            const uploader = ImageUploaderFactory.create();
            if (!uploader) return new Response("Image uploader not configured.", { status: Status.InternalServerError });
            const upload = await uploader.upload(img.data, `${crypto.randomUUID().substring(0, 12)}.png`);
            if (!upload?.url) return new Response("Failed to upload image to hosting provider.", { status: Status.BadGateway });
            await addToKvCache(cacheHash, upload.url, gen.revisedPrompt);
            return Response.redirect(upload.url, Status.Found);
        } else {
            const cached = await getFromFsCache(cacheHash);
            if (cached) { console.log(`[CACHE_FS] HIT: ${cacheHash}`); return new Response(cached.data, { headers: { "Content-Type": cached.contentType } }); }
            console.log(`[CACHE_FS] MISS: ${cacheHash}`);
            const gen = await generateImageFromBackend(description, width, height, model, seed);
            if (!gen?.imageUrl) return new Response("Backend failed to generate image.", { status: Status.ServiceUnavailable });
            const img = await fetchImageFromUrl(gen.imageUrl);
            if (!img) return new Response("Failed to fetch image data.", { status: Status.BadGateway });
            await addToFsCache(cacheHash, img.data, img.contentType, gen.imageUrl, gen.revisedPrompt);
            return new Response(img.data, { headers: { "Content-Type": img.contentType } });
        }
    }

    // Administrative endpoint to delete a cached item
    if (url.pathname === "/cache/delete" && request.method === "POST") {
        if (request.headers.get("X-Admin-Token") !== "SUPER_SECRET_ADMIN_TOKEN_CHANGE_ME") {
            return new Response("Unauthorized", { status: Status.Unauthorized });
        }
        try {
            const { description, width, height, model, seed: seedFromRequest } = await request.json();
            const seed = seedFromRequest ?? 42;
            const hash = await generateCacheHash(description, width, height, model, seed);
            const deleted = IMAGE_HOSTING_ENABLED ? await deleteFromKvCache(hash) : await deleteFromFsCache(hash);
            if (deleted) { console.log(`[ADMIN] Deleted cache for hash: ${hash}`); return new Response(`Deleted: ${hash}`, { status: Status.OK }); }
            else { return new Response(`Not Found: ${hash}`, { status: Status.NotFound }); }
        } catch (e) { return new Response(`Bad Request: ${e.message}`, { status: Status.BadRequest }); }
    }

    // Health status endpoint
    if (url.pathname === "/status" && request.method === "GET") {
        return Response.json({ status: "ok", backends: BACKEND_API_URLS, imageHosting: IMAGE_HOSTING_ENABLED });
    }

    return new Response(STATUS_TEXT[Status.NotFound], { status: Status.NotFound });
}

async function main() {
    if (IMAGE_HOSTING_ENABLED) {
        try { kv = await Deno.openKv(); console.log("[INIT] Deno KV store opened."); }
        catch (e) { console.error("[INIT] FATAL: Failed to open Deno KV store:", e); Deno.exit(1); }
    } else {
        try { await ensureDir(CACHE_DIR); console.log(`[INIT] File system cache directory ensured at: ${CACHE_DIR}`); }
        catch (e) { console.error(`[INIT] FATAL: Failed to access cache directory ${CACHE_DIR}:`, e); Deno.exit(1); }
    }
    console.log(`Image proxy listening on http://localhost:${PORT}`);
    Deno.serve({ port: PORT }, handler);
}

main();