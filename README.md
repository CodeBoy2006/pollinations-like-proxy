# Pollinations-like Image Proxy Server

[中文版](./README-zh.md)

*An ultra-lightweight proxy that turns text prompts into images via multiple AI back-ends, with smart caching and optional cloud hosting.*

[![Deno](https://img.shields.io/badge/Deno-000000?style=for-the-badge&logo=deno&logoColor=white)](https://deno.land/)
[![OpenAI](https://img.shields.io/badge/OpenAI-Compatible-00A67E?style=for-the-badge&logo=openai&logoColor=white)](https://openai.com/)

---

## ✨ Highlights

| Feature                 | Description                                                                 |
| ----------------------- | --------------------------------------------------------------------------- |
| **Multi-Backend Support** | Round-robin load balancing across any number of OpenAI-compatible endpoints.    |
| **Dual Cache Strategy** | Uses **Deno KV** for serverless (Deno Deploy) or **Local Filesystem** for self-hosting. |
| **Pluggable Image Hosting** | Built-in support for `smms`, `picgo`, and `cloudflare_imgbed`.                |
| **Reproducible Results**  | Full control over `seed` (default `42`), `model`, `width`, and `height`.        |
| **Secure by Default**   | Requires `?key=` for user access and `X-Admin-Token` for admin operations. |
| **Health Endpoint**       | `/status` provides a simple JSON health and configuration check.             |

---

## 🚀 Quick Start

1.  **Create a `.env` file** in the project root with your configuration.

    ```env
    # .env configuration example

    # --- Required Settings ---
    BACKEND_API_URLS="https://api1.example.com/v1,https://api2.example.com/v1"
    PROXY_ACCESS_KEY="a-very-secret-user-key"

    # --- Optional Settings ---
    # Token for authenticating with backend APIs
    AUTH_TOKEN="sk-backend-api-key"
    PORT=8080
    CACHE_DIR="./image_file_cache"

    # --- Image Hosting (Recommended for Deno Deploy) ---
    IMAGE_HOSTING_ENABLED=true
    IMAGE_HOSTING_PROVIDER=smms
    IMAGE_HOSTING_KEY="YOUR_SMMS_API_TOKEN"
    ```

2.  **Run the server.**

    The script will automatically use the settings from your `.env` file.

    ```bash
    # Run with all necessary permissions
    deno run -A image-gen.ts
    ```

### Running on Deno Deploy

Deno Deploy does not use `.env` files. Instead, set the configuration variables in your project's **Settings > Environment Variables** dashboard.

You **must** enable image hosting on Deno Deploy, as direct filesystem access is not permitted.

-   Set `IMAGE_HOSTING_ENABLED` to `true`.
-   Configure a `IMAGE_HOSTING_PROVIDER` and its required keys/URLs.

---

## 🔧 Configuration

Configure the proxy by creating a `.env` file in the project root. For Deno Deploy, set these as environment variables in the project dashboard.

| Variable                  | Required              | Description / Example                                         |
| ------------------------- | --------------------- | ------------------------------------------------------------- |
| `BACKEND_API_URLS`        | **✓**                 | Comma-separated list of backend URLs. `https://api1,https://api2` |
| `PROXY_ACCESS_KEY`        | **✓**                 | The access key required by clients. `my-access-key`           |
| `AUTH_TOKEN`              | -                     | Bearer token for authenticating with backend APIs.            |
| `PORT`                    | -                     | Port for the proxy server. Defaults to `8080`.                |
| `CACHE_DIR` | - | Local file system cache directory. Default is `./image_file_cache`|
| **Image Hosting**         |                       |                                                               |
| `IMAGE_HOSTING_ENABLED`   | -                     | `true` to enable KV cache & image hosting.                    |
| `IMAGE_HOSTING_PROVIDER`  | If hosting is enabled | `smms` \| `picgo` \| `cloudflare_imgbed`                      |
| `IMAGE_HOSTING_KEY`       | (Provider dependent)  | API key for `smms` or `picgo`.                                |
| `IMAGE_HOSTING_URL`       | (Provider dependent)  | Upload endpoint for `picgo` or `cloudflare_imgbed`.           |
| `IMAGE_HOSTING_AUTH_CODE` | (Provider dependent)  | Optional auth code for `cloudflare_imgbed`.                   |

---

## 🎯 Endpoints

| Method & Path                 | Description                                                                                               |
| ----------------------------- | --------------------------------------------------------------------------------------------------------- |
| **GET** `/prompt/{description}` | Generates or fetches a cached image. <br>Query Params: `key` (required), `width`, `height`, `model`, `seed` (default `42`). |
| **POST** `/cache/delete`      | Deletes a specific cache entry. Requires `X-Admin-Token` header. <br>JSON body must match generation params. |
| **GET** `/status`               | Returns a JSON object with the current health and configuration status.                                   |

---

## 🏁 Example

```bash
# Request an image with specific parameters
curl "http://localhost:8080/prompt/a red apple?key=a-very-secret-user-key&width=1024&height=1024&seed=7&model=flux-dev"
```

The first call generates the image and populates the cache. Subsequent identical calls will return the cached result instantly.

---

## 📝 Notes

-   If `IMAGE_HOSTING_ENABLED=false`, the proxy writes image binaries to the local `CACHE_DIR`. This mode is not compatible with Deno Deploy.
-   The cache key is a SHA-256 hash of the combined request parameters: `prompt|width|height|model|seed`. Changing any parameter results in a new image.

---

Made with Deno + TypeScript.