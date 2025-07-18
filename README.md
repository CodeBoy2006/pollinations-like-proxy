# Pollinations-like Image Proxy Server

[中文版](./README-zh.md)

*An ultra-lightweight proxy that turns text prompts into images via multiple AI back-ends, with smart caching, LLM prompt optimization, and optional cloud hosting.*

[![Deno](https://img.shields.io/badge/Deno-000000?style=for-the-badge&logo=deno&logoColor=white)](https://deno.land/)
[![OpenAI](https://img.shields.io/badge/OpenAI-Compatible-00A67E?style=for-the-badge&logo=openai&logoColor=white)](https://openai.com/)

---

## ✨ Highlights

| Feature | Description |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| **LLM Prompt Optimization** | (Optional) Automatically enhances user prompts via an external LLM for superior image quality, with template file support and content parsing. |
| **Multi-Backend Support** | Weighted load balancing across any number of OpenAI-compatible endpoints with per-backend token support. |
| **Smart Retry Logic** | Configurable retry attempts for blocked content across different backends. |
| **Transparent Fallback** | Seamless fallback to Pollinations.ai with local caching - no redirects, images served directly. |
| **Base64 & URL Support** | Handles both Base64 image data and URL responses from backends automatically. |
| **Model Mapping** | Map model names per backend for seamless compatibility across different providers. |
| **Dual Cache Strategy** | Uses **Local Filesystem** (default) or **Deno KV** (when image hosting is enabled). |
| **Content Moderation** | Automatically caches and handles blocked content to prevent repeated processing. |
| **Pluggable Image Hosting** | Built-in support for `smms`, `picgo`, and `cloudflare_imgbed`. |
| **Reproducible Results** | Full control over `seed` (default `42`), `model`, `width`, and `height`. |
| **Secure by Default** | Requires `?key=` for user access and `X-Admin-Token` for admin operations. |
| **Health Endpoint** | `/status` provides a simple JSON health and configuration check. |

---

## 🚀 Quick Start

1.  Create a `.env` file in the project root with your configuration. You can also create a `prompt-template.txt` file to define your optimization template.

    ```env
    # .env configuration example

    # --- Required Settings ---
    BACKEND_API_URLS="https://api1.example.com/v1,https://api2.example.com/v1"
    PROXY_ACCESS_KEY="a-very-secret-user-key"

    # --- Optional Settings ---
    # Global fallback token for authenticating with backend APIs
    AUTH_TOKEN="sk-backend-api-key"
    PORT=8080
    CACHE_DIR="./image_file_cache"

    # --- Advanced Backend Configuration ---
    # Backend weights for load balancing (JSON format)
    BACKEND_WEIGHTS='{"https://api1.example.com/v1": 2, "https://api2.example.com/v1": 1}'
    # Model mapping per backend (JSON format)
    MODEL_MAP='{"https://api1.example.com/v1": {"dall-e-3": "dall-e-3-hd"}}'
    # Per-backend authentication tokens (JSON format)
    TOKEN_MAP='{"https://api1.example.com/v1": "sk-api1-token"}'
    # Number of backends to try when content is blocked (default: 2)
    BLOCKED_RETRY_ATTEMPTS=2

    # --- Image Hosting (Optional) ---
    IMAGE_HOSTING_ENABLED=false
    IMAGE_HOSTING_PROVIDER=smms
    IMAGE_HOSTING_KEY="YOUR_SMMS_API_TOKEN"
    
    # --- LLM Prompt Optimization (Optional) ---
    LLM_OPTIMIZATION_ENABLED=true
    LLM_OPTIMIZATION_API_URL="https://api.openai.com"
    LLM_OPTIMIZATION_TOKEN="sk-your-llm-api-key"
    LLM_OPTIMIZATION_MODEL="gpt-4o"
    # Use a file for the template (highest priority)
    LLM_OPTIMIZATION_TEMPLATE_FILE=./prompt-template.txt
    ```

2.  Run the server.

    The script will automatically use the settings from your `.env` file.

    ```bash
    # Run with all necessary permissions
    deno run -A image-gen.ts
    ```

---

## 🔧 Configuration

Configure the proxy by creating a `.env` file in the project root or by setting environment variables. Settings from the `.env` file are loaded automatically.

| Variable | Required | Description / Example |
| -------------------------------- | --------------------- | ------------------------------------------------------------------------------------------- |
| `BACKEND_API_URLS` | **✓** | Comma-separated list of backend URLs. `https://api1,https://api2` |
| `PROXY_ACCESS_KEY` | **✓** | The access key required by clients. `my-access-key` |
| `AUTH_TOKEN` | - | Global fallback Bearer token for authenticating with backend APIs. |
| `PORT` | - | Port for the proxy server. Defaults to `8080`. |
| `CACHE_DIR` | - | Local file system cache directory. Defaults to `./image_file_cache`|
| **Advanced Backend Config** | | |
| `BACKEND_WEIGHTS` | - | JSON object defining weights for load balancing. `{"url1": 2, "url2": 1}` |
| `MODEL_MAP` | - | JSON object mapping model names per backend. `{"url1": {"model": "mapped-model"}}` |
| `TOKEN_MAP` | - | JSON object with per-backend authentication tokens. `{"url1": "token1"}` |
| `BLOCKED_RETRY_ATTEMPTS` | - | Number of backends to try when content is blocked. Defaults to `2`. |
| **Image Hosting** | | |
| `IMAGE_HOSTING_ENABLED` | - | `true` to enable image hosting. Caching will use Deno KV instead of the local filesystem. |
| `IMAGE_HOSTING_PROVIDER` | If hosting is enabled | `smms` \| `picgo` \| `cloudflare_imgbed` |
| `IMAGE_HOSTING_KEY` | (Provider dependent) | API key for `smms` or `picgo`. |
| `IMAGE_HOSTING_URL` | (Provider dependent) | Upload endpoint for `picgo` or `cloudflare_imgbed`. |
| `IMAGE_HOSTING_AUTH_CODE` | (Provider dependent) | Optional auth code for `cloudflare_imgbed`. |
| **LLM Prompt Optimization** | | |
| `LLM_OPTIMIZATION_ENABLED` | - | `true` to enable prompt optimization. |
| `LLM_OPTIMIZATION_API_URL` | If optimization enabled | OpenAI-compatible API endpoint for optimization. |
| `LLM_OPTIMIZATION_TOKEN` | (Provider dependent) | Bearer token for the LLM API. |
| `LLM_OPTIMIZATION_MODEL` | - | Model name to use for optimization. Defaults to `gpt-3.5-turbo`. |
| `LLM_OPTIMIZATION_TEMPLATE_FILE` | - | Path to a file containing the prompt template. **Highest priority**. |
| `LLM_OPTIMIZATION_TEMPLATE` | - | A multi-line prompt template string (used if no file is provided). Use `\n` for newlines in a .env. |

---

## 🎯 Endpoints

| Method & Path | Description |
| ----------------------------- | --------------------------------------------------------------------------------------------------------- |
| **GET** `/prompt/{description}` | Generates or fetches a cached image. <br>Query Params: `key` (required), `width`, `height`, `model`, `seed` (default `42`). |
| **POST** `/cache/delete` | Deletes a specific cache entry. Requires `X-Admin-Token` header. <br>JSON body must match generation params. |
| **GET** `/status` | Returns a JSON object with the current health and configuration status. |

---

## 🏁 Example

```bash
# Request an image with specific parameters
curl "http://localhost:8080/prompt/a red apple?key=a-very-secret-user-key&width=1024&height=1024&seed=7&model=dall-e-3"
```

If LLM optimization is enabled, "a red apple" will first be sent to the LLM service for enhancement before the image is generated. The first call generates the image and populates the cache. Subsequent identical calls will return the cached result instantly.

---

## 🔄 Transparent Fallback Mechanism

When all configured backends fail or block content, the proxy seamlessly falls back to Pollinations.ai:

1.  **Direct Download**: Images are downloaded directly from Pollinations.ai (not redirected).
2.  **Local Caching**: Downloaded images are cached using the same system as backend images.
3.  **Transparent Serving**: Users receive image data directly without knowing about the fallback.
4.  **Performance Optimization**: Eliminates redirect steps and enables local caching for future requests.
5.  **Enhanced Prompts**: The fallback now uses the LLM-optimized prompt (if enabled), aiming for better results even from the fallback provider.

**Fallback URL Format:**
```
https://image.pollinations.ai/prompt/{optimized_description}?model=flux-pro&nofeed=true&width={width}&height={height}
```

---

## 📝 Notes

-   **LLM Prompt Optimization**:
    -   When enabled, the original prompt is sent to the configured LLM API to be enhanced based on a template.
    -   The system automatically parses the response, prioritizing text within `<prompt>` tags, otherwise cleaning and using the full response.
    -   If the optimization process fails or returns empty content, the system safely falls back to using the original prompt.
    -   The cache key is still generated from the **original prompt**, but the **optimized prompt** is cached along with the result to be reused on subsequent requests, avoiding repeat optimizations.
-   **Backend Support**: The proxy automatically handles both Base64 image data and URL responses from backends.
-   **Smart Retry Logic**: Configure `BLOCKED_RETRY_ATTEMPTS` to control how many backends to try when content is blocked (default: 2).
-   **Content Moderation**: Blocked prompts are cached to prevent repeated processing. Cached blocked content automatically triggers the transparent fallback mechanism.
-   **Load Balancing**: Use `BACKEND_WEIGHTS` to control traffic distribution across backends (higher weight = more requests).
-   **Model Mapping**: Use `MODEL_MAP` to translate model names per backend for compatibility across different providers.
-   **Authentication**: `TOKEN_MAP` allows per-backend tokens, with `AUTH_TOKEN` as a global fallback.
-   If `IMAGE_HOSTING_ENABLED=false` (the default), the proxy writes image binaries to the local `CACHE_DIR`. This is the standard self-hosted caching mode.
-   The cache key is a SHA-256 hash of the combined request parameters: `prompt|width|height|model|seed`. Changing any parameter results in a new image.

---

Made with Deno + TypeScript.