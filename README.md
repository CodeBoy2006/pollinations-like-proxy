# Pollinations-like Image Proxy Server

[中文版](./README-zh.md)

*An ultra-lightweight proxy that turns text prompts into images via multiple AI back-ends, with smart caching, LLM prompt optimization, content safety rewriting, and optional cloud hosting.*

[![Deno](https://img.shields.io/badge/Deno-000000?style=for-the-badge&logo=deno&logoColor=white)](https://deno.land/)
[![OpenAI](https://img.shields.io/badge/OpenAI-Compatible-00A67E?style=for-the-badge&logo=openai&logoColor=white)](https://openai.com/)

---

## ✨ Highlights

| Feature | Description |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| **LLM Prompt Optimization** | (Optional) Automatically enhances user prompts via an external LLM for superior image quality. |
| **De-NSFW Content Recovery** | (Optional) When a prompt is blocked, automatically rewrites it for safety and retries generation before using the final fallback. |
| **Multi-Backend Support** | Weighted load balancing across any number of OpenAI-compatible endpoints with per-backend token support. |
| **Smart Retry Logic** | Configurable retry attempts for blocked content across different backends. |
| **Multi-Stage Fallback** | Seamlessly retries with a safety-rewritten prompt, and finally falls back to Pollinations.ai if all else fails. |
| **Base64 & URL Support** | Handles both Base64 image data and URL responses from backends automatically. |
| **Model Mapping** | Map model names per backend for seamless compatibility across different providers. |
| **Dual Cache Strategy** | Uses **Local Filesystem** (default) or **Deno KV** (when image hosting is enabled). |
| **Content Moderation** | Caches blocked content to trigger the recovery/fallback mechanism instantly on subsequent requests. |
| **Pluggable Image Hosting** | Built-in support for `smms`, `picgo`, and `cloudflare_imgbed`. |
| **Reproducible Results** | Full control over `seed` (default `42`), `model`, `width`, and `height`. |
| **Secure by Default** | Requires `?key=` for user access and `X-Admin-Token` for admin operations. |
| **Health Endpoint** | `/status` provides a simple JSON health and configuration check. |

---

## 🚀 Quick Start

1.  Create a `.env` file in the project root with your configuration. You can also create template files like `prompt-template.txt` and `safe-prompt-template.txt`.

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
    
    # --- De-NSFW Content Safety Rewriting (Optional) ---
    DE_NSFW_ENABLED=true
    # Uses the same LLM API settings as optimization
    # Use a file for the safety rewriting template (highest priority)
    DE_NSFW_TEMPLATE_FILE=./safe-prompt-template.txt
    ```

2.  Run the server.

    The script will automatically use the settings from your `.env` file.

    ```bash
    # Run with all necessary permissions
    deno run -A image-gen.ts
    ```

---

## 🔧 Configuration

Configure the proxy by creating a `.env` file in the project root or by setting environment variables.

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
| `IMAGE_HOSTING_AUTH_CODE`| (Provider dependent) | Optional auth code for `cloudflare_imgbed`. |
| **LLM Prompt Optimization** | | |
| `LLM_OPTIMIZATION_ENABLED` | - | `true` to enable prompt optimization. |
| `LLM_OPTIMIZATION_API_URL` | If optimization enabled | OpenAI-compatible API endpoint for optimization. |
| `LLM_OPTIMIZATION_TOKEN` | (Provider dependent) | Bearer token for the LLM API. |
| `LLM_OPTIMIZATION_MODEL` | - | Model name to use for optimization. Defaults to `gpt-4.1-mini`. |
| `LLM_OPTIMIZATION_TEMPLATE_FILE` | - | Path to a file containing the prompt template. **Highest priority**. |
| `LLM_OPTIMIZATION_TEMPLATE` | - | A multi-line prompt template string. Use `\n` for newlines in a .env. |
| **Content Safety Rewriting** | | |
| `DE_NSFW_ENABLED` | - | `true` to enable safety rewriting for blocked prompts. |
| `DE_NSFW_TEMPLATE_FILE` | - | Path to a file containing the safety rewriting template. **Highest priority**. |
| `DE_NSFW_TEMPLATE` | - | A multi-line template string for safety rewriting. |

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

If LLM optimization is enabled, "a red apple" will first be sent to the LLM service for enhancement. If the backend blocks the enhanced prompt, and safety rewriting is enabled, the prompt will be rewritten again to be safer and retried. The first successful call generates the image and populates the cache.

---

## 🧠 Multi-Stage Recovery & Fallback Mechanism

The proxy employs a robust, multi-stage process to maximize the success rate of image generation:

1.  **Prompt Optimization**: If enabled, the initial user prompt is enhanced for quality.
2.  **Initial Generation Attempt**: The proxy attempts to generate the image using the weighted pool of backend providers.
3.  **Content Safety Rewrite**: If a backend blocks the prompt, and `DE_NSFW_ENABLED=true`, the proxy triggers an intelligent rewrite using a dedicated safety template to remove potentially problematic content.
4.  **Retry Generation**: The new, safer prompt is used to retry image generation across the backend pool.
5.  **Final Fallback**: If all above steps fail, the proxy seamlessly falls back to Pollinations.ai, using the most promising prompt (optimized or rewritten) to make a final attempt.
    -   Images are downloaded directly and served to the user, not redirected.
    -   The result is cached locally, just like any other successful generation.

This tiered approach significantly increases the likelihood of a successful image generation, even for prompts that might trigger content filters.

---

## 📝 Notes

-   **Prompt Optimization vs. Safety Rewriting**:
    -   **Optimization** happens *before* the first generation attempt and aims to improve image *quality*.
    -   **Safety Rewriting** happens *after* a generation attempt is blocked and aims to ensure *compliance* with content policies.
    -   Both features use the same configured LLM API but with different templates.
-   **Cache Key Logic**: The cache key is always generated from the **original user prompt** and parameters. The system caches the final successful prompt (optimized or rewritten) along with the image to ensure reproducibility and avoid repeated processing.
-   **Backend Support**: The proxy automatically handles both Base64 image data and URL responses from backends.
-   **Load Balancing**: Use `BACKEND_WEIGHTS` to control traffic distribution across backends (higher weight = more requests).
-   **Authentication**: `TOKEN_MAP` allows per-backend tokens, with `AUTH_TOKEN` as a global fallback.
-   **Cache Storage**: If `IMAGE_HOSTING_ENABLED=false` (the default), the proxy writes image binaries to the local `CACHE_DIR`. When enabled, it uses Deno KV.
-   The cache key is a SHA-256 hash of the combined request parameters: `prompt|width|height|model|seed`. Changing any parameter results in a new image.

---

Made with Deno + TypeScript.