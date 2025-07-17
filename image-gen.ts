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

// --- ARGUMENT AND ENVIRONMENT VARIABLE PARSING ---
const args = parse(Deno.args, {
  string: [
    "backends", "port", "token", "cache-dir", "proxy-key",
    "backend-weights",
    "model-map",
    "token-map",
    "blocked-retry-attempts",
    "image-hosting-provider",
    "image-hosting-key",
    "image-hosting-url",
    "image-hosting-auth-code",
  ],
  boolean: ["image-hosting-enabled"],
  default: {
    port: "8080",
    "cache-dir": "./image_file_cache",
    "image-hosting-enabled": false,
    "blocked-retry-attempts": "2",
  },
});

const BACKEND_API_URLS_RAW = args.backends || Deno.env.get("BACKEND_API_URLS");
const PORT = parseInt(args.port || Deno.env.get("PORT") || "8080", 10);
const AUTH_TOKEN = args.token || Deno.env.get("AUTH_TOKEN");
const CACHE_DIR = args["cache-dir"] || Deno.env.get("CACHE_DIR");
const PROXY_ACCESS_KEY = args["proxy-key"] || Deno.env.get("PROXY_ACCESS_KEY");
const BACKEND_WEIGHTS_RAW = args["backend-weights"] || Deno.env.get("BACKEND_WEIGHTS");
const MODEL_MAP_RAW = args["model-map"] || Deno.env.get("MODEL_MAP");
const TOKEN_MAP_RAW = args["token-map"] || Deno.env.get("TOKEN_MAP");
const BLOCKED_RETRY_ATTEMPTS = parseInt(args["blocked-retry-attempts"] || Deno.env.get("BLOCKED_RETRY_ATTEMPTS") || "2", 10);

const IMAGE_HOSTING_ENABLED = args["image-hosting-enabled"] || (Deno.env.get("IMAGE_HOSTING_ENABLED") === "true");
const IMAGE_HOSTING_PROVIDER = args["image-hosting-provider"] || Deno.env.get("IMAGE_HOSTING_PROVIDER");
const IMAGE_HOSTING_KEY = args["image-hosting-key"] || Deno.env.get("IMAGE_HOSTING_KEY");
const IMAGE_HOSTING_URL = args["image-hosting-url"] || Deno.env.get("IMAGE_HOSTING_URL");
const IMAGE_HOSTING_AUTH_CODE = args["image-hosting-auth-code"] || Deno.env.get("IMAGE_HOSTING_AUTH_CODE");

// --- CONFIGURATION VALIDATION AND PARSING ---
if (!BACKEND_API_URLS_RAW) { console.error("FATAL: Backend API URLs are not set via --backends or BACKEND_API_URLS."); Deno.exit(1); }
const BACKEND_API_URLS = BACKEND_API_URLS_RAW.split(",").map((url) => url.trim().replace(/\/$/, "")).filter(Boolean);
if (BACKEND_API_URLS.length === 0) { console.error("FATAL: No valid backend API URLs found."); Deno.exit(1); }
if (!PROXY_ACCESS_KEY) { console.error("FATAL: Proxy access key is not set via --proxy-key or PROXY_ACCESS_KEY."); Deno.exit(1); }

let modelMap: Record<string, Record<string, string>> = {};
if (MODEL_MAP_RAW) { try { modelMap = JSON.parse(MODEL_MAP_RAW); } catch (e) { console.error(`FATAL: Invalid JSON in --model-map or MODEL_MAP: ${e.message}`); Deno.exit(1); } }

let tokenMap: Record<string, string> = {};
if (TOKEN_MAP_RAW) { try { tokenMap = JSON.parse(TOKEN_MAP_RAW); } catch (e) { console.error(`FATAL: Invalid JSON in --token-map or TOKEN_MAP: ${e.message}`); Deno.exit(1); } }

let weightedBackends: string[] = [];
const backendWeights: Record<string, number> = {};
function initializeBackends() {
    const weights: Record<string, number> = {};
    if (BACKEND_WEIGHTS_RAW) {
        try { Object.assign(weights, JSON.parse(BACKEND_WEIGHTS_RAW)); }
        catch (e) { console.error(`FATAL: Invalid JSON in --backend-weights or BACKEND_WEIGHTS: ${e.message}`); Deno.exit(1); }
    }
    weightedBackends = [];
    for (const url of BACKEND_API_URLS) {
        const weight = weights[url] ?? 1;
        if (typeof weight !== 'number' || weight < 0) {
            console.warn(`WARNING: Invalid weight for backend ${url}. Using default weight of 1.`);
            backendWeights[url] = 1;
        } else {
            backendWeights[url] = weight;
        }
        for (let i = 0; i < backendWeights[url]; i++) {
            weightedBackends.push(url);
        }
    }
    if (weightedBackends.length === 0) {
        console.warn("WARNING: No backends available after applying weights. Falling back to equal weighting.");
        weightedBackends = [...BACKEND_API_URLS];
        BACKEND_API_URLS.forEach(url => backendWeights[url] = 1);
    }
}
initializeBackends(); // This is now correctly used again.

if (IMAGE_HOSTING_ENABLED) { if (!IMAGE_HOSTING_PROVIDER) { console.error("FATAL: Image Hosting is enabled, but provider is not set."); Deno.exit(1); } switch(IMAGE_HOSTING_PROVIDER) { case 'smms': if (!IMAGE_HOSTING_KEY) { console.error("FATAL: SM.MS provider requires an API key."); Deno.exit(1); } break; case 'picgo': if (!IMAGE_HOSTING_KEY || !IMAGE_HOSTING_URL) { console.error("FATAL: PicGo provider requires an API key and URL."); Deno.exit(1); } break; case 'cloudflare_imgbed': if (!IMAGE_HOSTING_URL) { console.error("FATAL: Cloudflare Imgbed provider requires a URL."); Deno.exit(1); } break; default: console.error(`FATAL: Unknown image hosting provider '${IMAGE_HOSTING_PROVIDER}'.`); Deno.exit(1); } }

console.log("--- Proxy Configuration ---");
console.log(`Port: ${PORT}`);
console.log(`Blocked Prompt Retry Limit: ${BLOCKED_RETRY_ATTEMPTS}`);
console.log("Backends & Weights:");
Object.entries(backendWeights).forEach(([url, weight]) => { const customTokenInfo = tokenMap[url] ? '(Custom Token)' : (AUTH_TOKEN ? '(Global Token)' : '(No Token)'); console.log(`  - ${url} (Weight: ${weight}) ${customTokenInfo}`); });
if (Object.keys(modelMap).length > 0) { console.log("Model Mappings:"); console.log(JSON.stringify(modelMap, null, 2)); } else { console.log("Model Mappings: None"); }
console.log(`Image Hosting: ${IMAGE_HOSTING_ENABLED ? `Enabled (Provider: ${IMAGE_HOSTING_PROVIDER})` : 'Disabled'}`);
console.log(`Cache Mode: ${IMAGE_HOSTING_ENABLED ? 'Deno KV' : `File System (${CACHE_DIR})`}`);
console.log("--------------------------");

// --- UTILITY AND HELPER FUNCTIONS (UNCHANGED) ---
async function generateCacheHash(description: string, width?: number, height?: number, model?: string, seed?: number): Promise<string> { const keyString = `${description.toLowerCase().trim()}|${width || "def"}|${height || "def"}|${model || "def"}|${seed || "def"}`; const data = new TextEncoder().encode(keyString); const hashBuffer = await crypto.subtle.digest('SHA-256', data); const hashArray = Array.from(new Uint8Array(hashBuffer)); return hashArray.map(b => b.toString(16).padStart(2, '0')).join(''); }
function base64ToUint8Array(base64: string): Uint8Array { const cleanBase64 = base64.replace(/^data:image\/[a-z]+;base64,/, ''); const binaryString = atob(cleanBase64); const bytes = new Uint8Array(binaryString.length); for (let i = 0; i < binaryString.length; i++) { bytes[i] = binaryString.charCodeAt(i); } return bytes; }
function detectContentTypeFromBase64(base64: string): string { const cleanBase64 = base64.replace(/^data:image\/[a-z]+;base64,/, ''); if (cleanBase64.startsWith('iVBORw0KGgo')) return 'image/png'; if (cleanBase64.startsWith('/9j/')) return 'image/jpeg'; if (cleanBase64.startsWith('R0lGODlh') || cleanBase64.startsWith('R0lGODdh')) return 'image/gif'; if (cleanBase64.includes('UklGR') && cleanBase64.includes('V0VCUw')) return 'image/webp'; return 'image/png'; }
// --- IMAGE UPLOADER CLASSES (UNCHANGED) ---
interface ImageUploader { upload(data: Uint8Array, filename: string): Promise<{ url: string } | null>; }
class SmMsUploader implements ImageUploader { private static API_URL = "https://sm.ms/api/v2/upload"; constructor(private apiKey: string) {} async upload(data: Uint8Array, filename: string): Promise<{ url: string } | null> { try { const formData = new FormData(); formData.append("smfile", new Blob([data]), filename); const response = await fetch(SmMsUploader.API_URL, { method: "POST", headers: { 'Authorization': this.apiKey }, body: formData }); const json = await response.json(); if (!response.ok || !json.success) { console.error(`[UPLOADER_SMMS] Upload failed: ${json.message || 'Unknown error'}`); return null; } return json.data?.url ? { url: json.data.url } : null; } catch (e) { console.error(`[UPLOADER_SMMS] Request error:`, e); return null; } } }
class PicGoUploader implements ImageUploader { constructor(private apiKey: string, private apiUrl: string) {} async upload(data: Uint8Array, filename: string): Promise<{ url: string } | null> { try { const formData = new FormData(); formData.append("source", new Blob([data]), filename); const response = await fetch(this.apiUrl, { method: "POST", headers: { 'X-API-Key': this.apiKey, 'Accept': 'application/json' }, body: formData }); const json = await response.json(); if (!response.ok || json.status_code !== 200) { console.error(`[UPLOADER_PICGO] Upload failed: ${json.error?.message || 'Unknown error'}`); return null; } return json.image?.url ? { url: json.image.url } : null; } catch (e) { console.error(`[UPLOADER_PICGO] Request error:`, e); return null; } } }
class CloudflareImgbedUploader implements ImageUploader { constructor(private apiUrl: string, private authCode?: string) {} async upload(data: Uint8Array, filename: string): Promise<{ url: string } | null> { try { const url = new URL(this.apiUrl); if (this.authCode) url.searchParams.set("authCode", this.authCode); const formData = new FormData(); formData.append("file", new Blob([data]), filename); const response = await fetch(url.href, { method: "POST", body: formData }); if (!response.ok) { console.error(`[UPLOADER_CF] Upload failed with status ${response.status}.`); return null; } const json = await response.json(); const path = Array.isArray(json) ? json[0]?.src : null; return path ? { url: new URL(path, this.apiUrl).href } : null; } catch (e) { console.error(`[UPLOADER_CF] Request error:`, e); return null; } } }
class ImageUploaderFactory { static create(): ImageUploader | null { if (!IMAGE_HOSTING_ENABLED) return null; switch (IMAGE_HOSTING_PROVIDER) { case 'smms': return new SmMsUploader(IMAGE_HOSTING_KEY!); case 'picgo': return new PicGoUploader(IMAGE_HOSTING_KEY!, IMAGE_HOSTING_URL!); case 'cloudflare_imgbed': return new CloudflareImgbedUploader(IMAGE_HOSTING_URL!, IMAGE_HOSTING_AUTH_CODE); default: return null; } } }
// --- CACHING LOGIC (UNCHANGED) ---
let kv: Deno.Kv | null = null;
interface KvCacheEntry { hostedUrl?: string; revisedPrompt?: string; blocked?: boolean; }
async function getFromKvCache(hash: string): Promise<KvCacheEntry | null> { return kv ? (await kv.get<KvCacheEntry>(["images", hash])).value : null; }
async function addToKvCache(hash: string, entry: KvCacheEntry): Promise<void> { if (kv) { await kv.set(["images", hash], entry); console.log(`[CACHE_KV] Added${entry.blocked ? ' (blocked)' : ''}: ${hash}`); } }
async function deleteFromKvCache(hash: string): Promise<boolean> { if (!kv) return false; const res = await kv.atomic().check({ key: ["images", hash], versionstamp: null }).delete(["images", hash]).commit(); return res.ok; }
interface FsCacheEntry { data?: Uint8Array; contentType?: string; revisedPrompt?: string; blocked?: boolean; }
interface FsCacheMetadata { contentType?: string; originalUrl?: string; revisedPrompt?: string; createdAt: string; blocked?: boolean; }
function getCacheFilePaths(hash: string) { return { dataPath: join(CACHE_DIR, `${hash}.data`), metaPath: join(CACHE_DIR, `${hash}.meta.json`) }; }
async function getFromFsCache(hash: string): Promise<FsCacheEntry | null> { const { dataPath, metaPath } = getCacheFilePaths(hash); try { if (!(await Deno.stat(metaPath).catch(() => null))) return null; const metadata = JSON.parse(await Deno.readTextFile(metaPath)) as FsCacheMetadata; if (metadata.blocked) return { blocked: true, revisedPrompt: metadata.revisedPrompt }; const data = await Deno.readFile(dataPath); return { data, contentType: metadata.contentType, revisedPrompt: metadata.revisedPrompt }; } catch (e) { if (!(e instanceof Deno.errors.NotFound)) console.error(`[CACHE_FS] Read error for ${hash}:`, e); return null; } }
async function addToFsCache(hash: string, metadata: FsCacheMetadata, data?: Uint8Array): Promise<void> { const { dataPath, metaPath } = getCacheFilePaths(hash); try { const promises = [ Deno.writeTextFile(metaPath, JSON.stringify(metadata, null, 2)) ]; if (data && !metadata.blocked) { promises.push(Deno.writeFile(dataPath, data)); } await Promise.all(promises); console.log(`[CACHE_FS] Added${metadata.blocked ? ' (blocked)' : ''}: ${hash}`); } catch (e) { console.error(`[CACHE_FS] Write error for ${hash}:`, e); } }
async function deleteFromFsCache(hash: string): Promise<boolean> { const { dataPath, metaPath } = getCacheFilePaths(hash); const results = await Promise.allSettled([ Deno.remove(dataPath), Deno.remove(metaPath) ]); return results.some(r => r.status === 'fulfilled'); }

// --- CORE BACKEND LOGIC ---
type GenerationResult = | { status: "success"; imageData: Uint8Array; contentType: string; revisedPrompt?: string } | { status: "blocked"; reason: string } | { status: "error"; reason: string };
async function fetchImageFromUrl(imageUrl: string): Promise<{ data: Uint8Array, contentType: string } | null> { try { const response = await fetch(imageUrl); if (!response.ok) { console.error(`[FETCH] Failed to fetch image from ${imageUrl}: ${response.status}`); return null; } const contentType = response.headers.get("content-type") || "image/png"; const arrayBuffer = await response.arrayBuffer(); return { data: new Uint8Array(arrayBuffer), contentType }; } catch (e) { console.error(`[FETCH] Error fetching image data from ${imageUrl}:`, e); return null; } }

function getNextBackendUrl(exclude: string[] = []): string | null {
    const availableBackends = weightedBackends.filter(b => !exclude.includes(b));
    if (availableBackends.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * availableBackends.length);
    return availableBackends[randomIndex];
}

async function generateImageFromBackend(description: string, width?: number, height?: number, model?: string, seed?: number): Promise<GenerationResult> {
    const uniqueBackendCount = new Set(BACKEND_API_URLS).size;
    const maxAttempts = Math.max(uniqueBackendCount, BLOCKED_RETRY_ATTEMPTS);
    
    let lastResult: GenerationResult = { status: "error", reason: "No backends were available or all failed." };
    let blockedAttempts = 0;
    const triedBackends: string[] = [];

    for (let i = 0; i < maxAttempts; i++) {
        const backendUrl = getNextBackendUrl(triedBackends);

        if (!backendUrl) {
            console.log("[BACKEND] No more available backends to try.");
            break;
        }
        triedBackends.push(backendUrl);

        if (blockedAttempts >= BLOCKED_RETRY_ATTEMPTS) {
            console.log(`[MODERATION] Blocked retry limit (${BLOCKED_RETRY_ATTEMPTS}) reached.`);
            lastResult = { status: "blocked", reason: `Request was blocked by ${blockedAttempts} backends.` };
            break;
        }

        const requestUrl = `${backendUrl}/v1/images/generations`;
        const effectiveModel = model && modelMap[backendUrl]?.[model] ? modelMap[backendUrl][model] : model;
        if (model && effectiveModel !== model) { console.log(`[BACKEND] Mapping model "${model}" to "${effectiveModel}" for ${backendUrl}`); }

        const payload: Record<string, any> = { prompt: description, n: 1, seed: seed };
        if (effectiveModel) payload.model = effectiveModel;
        if (width && height) payload.size = `${width}x${height}`;
        
        console.log(`[BACKEND] Attempt #${i + 1}: Request to ${backendUrl} (Model: ${effectiveModel || 'default'})`);
        
        try {
            const headers: HeadersInit = { "Content-Type": "application/json", "Accept": "application/json" };
            const tokenToSend = tokenMap[backendUrl] || AUTH_TOKEN;
            if (tokenToSend) { headers["Authorization"] = `Bearer ${tokenToSend}`; }

            const res = await fetch(requestUrl, { method: "POST", headers, body: JSON.stringify(payload) });

            if (!res.ok) {
                lastResult = { status: "error", reason: `Backend returned error: ${res.status} from ${requestUrl}`};
                console.error(`[ATTEMPT_FAIL] ${lastResult.reason}. Trying next backend...`);
                continue;
            }

            const json = await res.json();
            const data = json.data?.[0];
            
            if (!data || !(data.url || data.b64_json)) {
                blockedAttempts++;
                lastResult = { status: "blocked", reason: `Backend ${backendUrl} returned no image data (likely moderated)` };
                console.warn(`[ATTEMPT_BLOCKED] ${lastResult.reason}.`);
                continue;
            }

            if (data.b64_json) {
                console.log(`[BACKEND] SUCCESS: Received base64 image data from ${backendUrl}`);
                return { status: "success", imageData: base64ToUint8Array(data.b64_json), contentType: detectContentTypeFromBase64(data.b64_json), revisedPrompt: data.revised_prompt };
            }
            
            if (data.url) {
                console.log(`[BACKEND] Received image URL from ${backendUrl}: ${data.url}`);
                const imageResult = await fetchImageFromUrl(data.url);
                if (!imageResult) {
                    lastResult = { status: "error", reason: `Failed to fetch image from URL: ${data.url}` };
                    console.error(`[ATTEMPT_FAIL] ${lastResult.reason}. Trying next backend...`);
                    continue;
                }
                console.log(`[BACKEND] SUCCESS: Fetched image data from ${backendUrl}`);
                return { status: "success", imageData: imageResult.data, contentType: imageResult.contentType, revisedPrompt: data.revised_prompt };
            }
        } catch (e) {
            lastResult = { status: "error", reason: `Network error for ${backendUrl}: ${e.message}` };
            console.error(`[ATTEMPT_FAIL] ${lastResult.reason}. Trying next backend...`);
        }
    }
    
    console.log(`All backend attempts failed. Final result: ${lastResult.status}`);
    return lastResult;
}

async function generateImageFromPollinations(description: string, width?: number, height?: number): Promise<{ imageData: Uint8Array; contentType: string } | null> {
    console.log(`[POLLINATIONS] Generating image from pollinations.ai for prompt: "${description}"`);

    try {
        const fallbackUrl = new URL(`https://image.pollinations.ai/prompt/${encodeURIComponent(description)}`);
        fallbackUrl.searchParams.set("model", "flux-pro");
        fallbackUrl.searchParams.set("nofeed", "true");
        if (width) fallbackUrl.searchParams.set("width", String(width));
        if (height) fallbackUrl.searchParams.set("height", String(height));

        console.log(`[POLLINATIONS] Requesting image from: ${fallbackUrl.href}`);

        const response = await fetch(fallbackUrl.href);
        if (!response.ok) {
            console.error(`[POLLINATIONS] Failed to fetch image: ${response.status} ${response.statusText}`);
            return null;
        }

        const contentType = response.headers.get("content-type") || "image/png";
        const arrayBuffer = await response.arrayBuffer();
        const imageData = new Uint8Array(arrayBuffer);

        console.log(`[POLLINATIONS] Successfully downloaded image (${imageData.length} bytes, ${contentType})`);
        return { imageData, contentType };

    } catch (error) {
        console.error(`[POLLINATIONS] Error generating image:`, error);
        return null;
    }
}

async function createFallbackResponse(description: string, width?: number, height?: number, model?: string, seed?: number): Promise<Response> {
    console.log(`[FALLBACK] Using pollinations.ai fallback for prompt: "${description}"`);

    // Generate cache hash for the fallback request
    const cacheHash = await generateCacheHash(description, width, height, model, seed);

    // Try to get the image from pollinations.ai
    const pollinationsResult = await generateImageFromPollinations(description, width, height);

    if (!pollinationsResult) {
        console.error(`[FALLBACK] Failed to generate image from pollinations.ai`);
        return new Response("Failed to generate image from fallback provider", {
            status: Status.InternalServerError,
            headers: { "Content-Type": "text/plain" }
        });
    }

    const { imageData, contentType } = pollinationsResult;

    // Cache the fallback result using the same caching system
    try {
        if (IMAGE_HOSTING_ENABLED) {
            // For KV cache with image hosting, upload to hosting provider
            const uploader = ImageUploaderFactory.create();
            if (uploader) {
                const upload = await uploader.upload(imageData, `${crypto.randomUUID().substring(0, 12)}.png`);
                if (upload?.url) {
                    await addToKvCache(cacheHash, { hostedUrl: upload.url });
                    console.log(`[FALLBACK] Cached fallback image to hosting provider: ${upload.url}`);
                    return new Response(imageData, { headers: { "Content-Type": contentType } });
                } else {
                    console.warn(`[FALLBACK] Failed to upload to hosting provider, returning image directly`);
                }
            } else {
                console.warn(`[FALLBACK] No image uploader configured, returning image directly`);
            }
        } else {
            // For file system cache, store the image data directly
            const metadata: FsCacheMetadata = {
                contentType,
                originalUrl: `https://image.pollinations.ai/prompt/${encodeURIComponent(description)}`,
                createdAt: new Date().toISOString()
            };
            await addToFsCache(cacheHash, metadata, imageData);
            console.log(`[FALLBACK] Cached fallback image to file system`);
        }
    } catch (cacheError) {
        console.error(`[FALLBACK] Failed to cache fallback image:`, cacheError);
        // Continue to return the image even if caching fails
    }

    // Return the image data directly to the user
    return new Response(imageData, { headers: { "Content-Type": contentType } });
}

async function handler(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pathSegments = url.pathname.split("/").filter(Boolean);
    
    if (request.method === "GET" && pathSegments[0] === "prompt" && pathSegments.length > 1) {
        if (url.searchParams.get("key") !== PROXY_ACCESS_KEY) { return new Response("Unauthorized", { status: Status.Unauthorized }); }
        const description = decodeURIComponent(pathSegments.slice(1).join("/"));
        const width = url.searchParams.get("width") ? parseInt(url.searchParams.get("width")!, 10) : undefined;
        const height = url.searchParams.get("height") ? parseInt(url.searchParams.get("height")!, 10) : undefined;
        const model = url.searchParams.get("model") || undefined;
        const seed = url.searchParams.has("seed") ? parseInt(url.searchParams.get("seed")!, 10) : 42;

        console.log(`[REQUEST] Prompt: "${description}", Model: ${model || 'default'}, Seed: ${seed}`);
        const cacheHash = await generateCacheHash(description, width, height, model, seed);

        const cached = IMAGE_HOSTING_ENABLED ? await getFromKvCache(cacheHash) : await getFromFsCache(cacheHash);
        if (cached) {
            if (cached.blocked) {
                console.log(`[CACHE_${IMAGE_HOSTING_ENABLED ? 'KV' : 'FS'}] BLOCKED_HIT: ${cacheHash}`);
                return await createFallbackResponse(description, width, height, model, seed);
            }
            console.log(`[CACHE_${IMAGE_HOSTING_ENABLED ? 'KV' : 'FS'}] HIT: ${cacheHash}`);
            if (IMAGE_HOSTING_ENABLED) { return Response.redirect((cached as KvCacheEntry).hostedUrl!, Status.Found); }
            else { const fsEntry = cached as FsCacheEntry; return new Response(fsEntry.data, { headers: { "Content-Type": fsEntry.contentType! } }); }
        }
        console.log(`[CACHE_${IMAGE_HOSTING_ENABLED ? 'KV' : 'FS'}] MISS: ${cacheHash}`);

        const genResult = await generateImageFromBackend(description, width, height, model, seed);
        
        if (genResult.status === 'success') {
            const { imageData, contentType, revisedPrompt } = genResult;
            if (IMAGE_HOSTING_ENABLED) {
                const uploader = ImageUploaderFactory.create();
                if (!uploader) { console.error("[UPLOAD_FAIL] Image uploader not configured. Using fallback."); return await createFallbackResponse(description, width, height, model, seed); }
                const upload = await uploader.upload(imageData, `${crypto.randomUUID().substring(0, 12)}.png`);
                if (!upload?.url) { console.error("[UPLOAD_FAIL] Failed to upload image to hosting provider. Using fallback."); return await createFallbackResponse(description, width, height, model, seed); }
                await addToKvCache(cacheHash, { hostedUrl: upload.url, revisedPrompt });
                return Response.redirect(upload.url, Status.Found);
            } else {
                const metadata: FsCacheMetadata = { contentType, revisedPrompt, createdAt: new Date().toISOString() };
                await addToFsCache(cacheHash, metadata, imageData);
                return new Response(imageData, { headers: { "Content-Type": contentType } });
            }
        } else {
            console.log(`[FALLBACK] Generation failed (Status: ${genResult.status}). Reason: ${genResult.reason}. Using fallback.`);
            if (genResult.status === 'blocked') {
                console.log(`[CACHE] Marking prompt as permanently blocked: ${cacheHash}`);
                if (IMAGE_HOSTING_ENABLED) { await addToKvCache(cacheHash, { blocked: true }); }
                else { await addToFsCache(cacheHash, { blocked: true, createdAt: new Date().toISOString() }); }
            }
            return await createFallbackResponse(description, width, height, model, seed);
        }
    }

    if (url.pathname === "/cache/delete" && request.method === "POST") {
        if (request.headers.get("X-Admin-Token") !== "SUPER_SECRET_ADMIN_TOKEN_CHANGE_ME") { return new Response("Unauthorized", { status: Status.Unauthorized }); }
        try {
            const { description, width, height, model, seed: seedFromRequest } = await request.json();
            const seed = seedFromRequest ?? 42;
            const hash = await generateCacheHash(description, width, height, model, seed);
            const deleted = IMAGE_HOSTING_ENABLED ? await deleteFromKvCache(hash) : await deleteFromFsCache(hash);
            if (deleted) { console.log(`[ADMIN] Deleted cache for hash: ${hash}`); return new Response(`Deleted: ${hash}`, { status: Status.OK }); }
            else { return new Response(`Not Found: ${hash}`, { status: Status.NotFound }); }
        } catch (e) { return new Response(`Bad Request: ${e.message}`, { status: Status.BadRequest }); }
    }

    if (url.pathname === "/status" && request.method === "GET") {
        return Response.json({ status: "ok", backends: backendWeights, imageHosting: IMAGE_HOSTING_ENABLED });
    }

    return new Response(STATUS_TEXT[Status.NotFound], { status: Status.NotFound });
}

async function main() {
    if (IMAGE_HOSTING_ENABLED) { try { kv = await Deno.openKv(); console.log("[INIT] Deno KV store opened."); } catch (e) { console.error("[INIT] FATAL: Failed to open Deno KV store:", e); Deno.exit(1); } }
    else { try { await ensureDir(CACHE_DIR); console.log(`[INIT] File system cache directory ensured at: ${CACHE_DIR}`); } catch (e) { console.error(`[INIT] FATAL: Failed to access cache directory ${CACHE_DIR}:`, e); Deno.exit(1); } }
    console.log(`Image proxy listening on http://localhost:${PORT}`);
    Deno.serve({ port: PORT }, handler);
}

main();