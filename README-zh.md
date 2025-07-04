
# 类 Pollination 图像代理服务器

[English Version](./README.md)

*一个超轻量级的代理服务，可通过多个 AI 后端将文本提示词转换为图像，并具备智能缓存和可选的云图床托管功能。*

[![Deno](https://img.shields.io/badge/Deno-000000?style=for-the-badge&logo=deno&logoColor=white)](https://deno.land/)
[![OpenAI](https://img.shields.io/badge/OpenAI-Compatible-00A67E?style=for-the-badge&logo=openai&logoColor=white)](https://openai.com/)

---

## ✨ 亮点

| 功能 | 描述 |
| ----------------------- | --------------------------------------------------------------------------- |
| **多后端支持** | 轮询负载均衡，支持任意数量的 OpenAI 兼容端点。 |
| **双缓存策略** | 使用 **Deno KV** (适用于 Deno Deploy) 或 **本地文件系统** (适用于自托管)。 |
| **可插拔的图床托管** | 内置对 `smms`, `picgo`, 和 `cloudflare_imgbed` 的支持。 |
| **可复现的结果** | 完全控制 `seed` (默认 `42`), `model`, `width`, 和 `height`。 |
| **默认安全** | 用户访问需 `?key=` 参数，管理操作需 `X-Admin-Token` 请求头。 |
| **健康检查端点** | `/status` 提供简单的 JSON 格式的健康与配置状态检查。 |

---

## 🚀 快速开始

1.  在项目根目录创建一个 `.env` 文件并填入您的配置。

    ```env
    # .env 配置文件示例

    # --- 必需设置 ---
    BACKEND_API_URLS="https://api1.example.com/v1,https://api2.example.com/v1"
    PROXY_ACCESS_KEY="一个非常安全的用户密钥"

    # --- 可选设置 ---
    # 用于向后端 API 进行身份验证的 Token
    AUTH_TOKEN="sk-backend-api-key"
    PORT=8080
    CACHE_DIR="./image_file_cache"

    # --- 图床托管 (Deno Deploy 推荐) ---
    IMAGE_HOSTING_ENABLED=true
    IMAGE_HOSTING_PROVIDER=smms (或者 picgo, cloudflare_imgbed)
    IMAGE_HOSTING_KEY="YOUR_SMMS_API_TOKEN" (如果使用 smms 或 picgo)
    IMAGE_HOSTING_URL="YOUR_PICGO_UPLOAD_ENDPOINT" (如果使用 picgo)
    IMAGE_HOSTING_AUTH_CODE="YOUR_CLOUDFLARE_AUTH_CODE" (如果使用 cloudflare_imgbed)
    ```

2.  运行服务器。

    脚本将自动加载并使用 `.env` 文件中的设置。

    ```bash
    # 使用所有必要权限运行
    deno run -A main.ts
    ```

### 在 Deno Deploy 上运行

Deno Deploy 不使用 `.env` 文件。请在您项目的 **Settings > Environment Variables** 面板中设置环境变量。

由于 Deno Deploy 不支持直接文件系统访问，您 **必须** 开启图床托管功能。

-   将 `IMAGE_HOSTING_ENABLED` 设置为 `true`。
-   配置一个 `IMAGE_HOSTING_PROVIDER` 及其所需的密钥/URL。

---

## 🔧 配置

通过在项目根目录创建 `.env` 文件来配置代理。对于 Deno Deploy，请在项目仪表盘中将它们设置为环境变量。

| 环境变量 | 是否必需 | 描述 / 示例 |
| ------------------------- | --------------------- | ------------------------------------------------------------- |
| `BACKEND_API_URLS` | **✓** | 逗号分隔的后端 URL 列表。`https://api1,https://api2` |
| `PROXY_ACCESS_KEY` | **✓** | 客户端访问时所需的密钥。`my-access-key` |
| `AUTH_TOKEN` | - | 用于向后端 API 进行身份验证的 Bearer Token。 |
| `PORT` | - | 代理服务器的端口。默认为 `8080`。 |
| `CACHE_DIR` | - | 本地文件系统缓存目录。默认为 `./image_file_cache`|
| **图床托管** | | |
| `IMAGE_HOSTING_ENABLED` | - | 设置为 `true` 以启用 KV 缓存和图床托管。 |
| `IMAGE_HOSTING_PROVIDER` | 若托管已启用 | `smms` \| `picgo` \| `cloudflare_imgbed` |
| `IMAGE_HOSTING_KEY` | (取决于服务商) | `smms` 或 `picgo` 的 API 密钥。 |
| `IMAGE_HOSTING_URL` | (取决于服务商) | `picgo` 或 `cloudflare_imgbed` 的上传端点。 |
| `IMAGE_HOSTING_AUTH_CODE` | (取决于服务商) | `cloudflare_imgbed` 的可选认证码。 |

---

## 🎯 API 端点

| 方法与路径 | 描述 |
| ----------------------------- | --------------------------------------------------------------------------------------------------------- |
| **GET** `/prompt/{description}` | 生成或获取缓存的图像。<br>查询参数: `key` (必需), `width`, `height`, `model`, `seed` (默认 `42`)。 |
| **POST** `/cache/delete` | 删除指定的缓存条目。需要 `X-Admin-Token` 请求头。<br>JSON 请求体必须匹配生成参数。 |
| **GET** `/status` | 返回一个包含当前健康与配置状态的 JSON 对象。 |

---

## 🏁 示例

```bash
# 请求一张带有特定参数的图片
curl "http://localhost:8080/prompt/a red apple?key=a-very-secret-user-key&width=1024&height=1024&seed=7&model=flux-dev"
```

第一次调用会生成图像并填充缓存。后续的相同调用将立即返回缓存结果。

---

## 📝 注意事项

-   如果 `IMAGE_HOSTING_ENABLED=false`，代理会将图像二进制文件写入本地的 `CACHE_DIR` 目录。此模式与 Deno Deploy 不兼容。
-   缓存键是请求参数组合的 SHA-256 哈希值：`prompt|width|height|model|seed`。更改任何参数都会生成一张新图像。

---

基于 Deno + TypeScript 构建。