# 类 Pollinations 图像代理服务器

[English Version](./README.md)

*一个超轻量级的代理服务，可通过多个 AI 后端将文本提示词转换为图像，并具备智能缓存、LLM 提示词优化和可选的云图床托管功能。*

[![Deno](https://img.shields.io/badge/Deno-000000?style=for-the-badge&logo=deno&logoColor=white)](https://deno.land/)
[![OpenAI](https://img.shields.io/badge/OpenAI-Compatible-00A67E?style=for-the-badge&logo=openai&logoColor=white)](https://openai.com/)

---

## ✨ 亮点

| 功能 | 描述 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| **LLM 提示词优化** | (可选) 通过外部 LLM 服务自动优化和增强用户提示词，以获得更佳的图像质量，支持模板文件和内容解析。 |
| **多后端支持** | 加权负载均衡，支持任意数量的 OpenAI 兼容端点，并支持每个后端独立的 token 配置。 |
| **智能重试逻辑** | 可配置的重试次数，当内容被阻止时尝试不同的后端。 |
| **透明后备机制** | 无缝后备到 Pollinations.ai 并本地缓存 - 无重定向，直接提供图像。 |
| **Base64 和 URL 支持** | 自动处理来自后端的 Base64 图像数据和 URL 响应。 |
| **模型映射** | 为每个后端映射模型名称，实现不同提供商之间的无缝兼容。 |
| **双缓存策略** | 使用 **本地文件系统** (默认) 或 **Deno KV** (当启用图床托管时)。 |
| **内容审核** | 自动缓存和处理被阻止的内容，防止重复处理。 |
| **可插拔的图床托管** | 内置对 `smms`, `picgo`, 和 `cloudflare_imgbed` 的支持。 |
| **可复现的结果** | 完全控制 `seed` (默认 `42`), `model`, `width`, 和 `height`。 |
| **默认安全** | 用户访问需 `?key=` 参数，管理操作需 `X-Admin-Token` 请求头。 |
| **健康检查端点** | `/status` 提供简单的 JSON 格式的健康与配置状态检查。 |

---

## 🚀 快速开始

1.  在项目根目录创建一个 `.env` 文件并填入您的配置。您还可以创建一个 `prompt-template.txt` 文件来定义您的优化模板。

    ```env
    # .env 配置文件示例

    # --- 必需设置 ---
    BACKEND_API_URLS="https://api1.example.com/v1,https://api2.example.com/v1"
    PROXY_ACCESS_KEY="一个非常安全的用户密钥"

    # --- 可选设置 ---
    # 全局后备 Token，用于向后端 API 进行身份验证
    AUTH_TOKEN="sk-backend-api-key"
    PORT=8080
    CACHE_DIR="./image_file_cache"

    # --- 高级后端配置 ---
    # 负载均衡的后端权重 (JSON 格式)
    BACKEND_WEIGHTS='{"https://api1.example.com/v1": 2, "https://api2.example.com/v1": 1}'
    # 每个后端的模型映射 (JSON 格式)
    MODEL_MAP='{"https://api1.example.com/v1": {"dall-e-3": "dall-e-3-hd"}}'
    # 每个后端的身份验证 token (JSON 格式)
    TOKEN_MAP='{"https://api1.example.com/v1": "sk-api1-token"}'
    # 内容被阻止时尝试的后端数量 (默认: 2)
    BLOCKED_RETRY_ATTEMPTS=2

    # --- 图床托管 (可选) ---
    IMAGE_HOSTING_ENABLED=false
    IMAGE_HOSTING_PROVIDER=smms
    IMAGE_HOSTING_KEY="YOUR_SMMS_API_TOKEN"

    # --- LLM 提示词优化 (可选) ---
    LLM_OPTIMIZATION_ENABLED=true
    LLM_OPTIMIZATION_API_URL="https://api.openai.com"
    LLM_OPTIMIZATION_TOKEN="sk-your-llm-api-key"
    LLM_OPTIMIZATION_MODEL="gpt-4o"
    # 优先从文件加载模板
    LLM_OPTIMIZATION_TEMPLATE_FILE=./prompt-template.txt
    ```

2.  运行服务器。

    脚本将自动加载并使用 `.env` 文件中的设置。

    ```bash
    # 使用所有必要权限运行
    deno run -A image-gen.ts
    ```

---

## 🔧 配置

通过在项目根目录创建 `.env` 文件或设置环境变量来配置代理。`.env` 文件中的设置会被自动加载。

| 环境变量 | 是否必需 | 描述 / 示例 |
| -------------------------------- | --------------------- | ------------------------------------------------------------------------------------------- |
| `BACKEND_API_URLS` | **✓** | 逗号分隔的后端 URL 列表。`https://api1,https://api2` |
| `PROXY_ACCESS_KEY` | **✓** | 客户端访问时所需的密钥。`my-access-key` |
| `AUTH_TOKEN` | - | 全局后备 Bearer Token，用于向后端 API 进行身份验证。 |
| `PORT` | - | 代理服务器的端口。默认为 `8080`。 |
| `CACHE_DIR` | - | 本地文件系统缓存目录。默认为 `./image_file_cache`|
| **高级后端配置** | | |
| `BACKEND_WEIGHTS` | - | 定义负载均衡权重的 JSON 对象。`{"url1": 2, "url2": 1}` |
| `MODEL_MAP` | - | 每个后端模型名称映射的 JSON 对象。`{"url1": {"model": "mapped-model"}}` |
| `TOKEN_MAP` | - | 每个后端身份验证 token 的 JSON 对象。`{"url1": "token1"}` |
| `BLOCKED_RETRY_ATTEMPTS` | - | 内容被阻止时尝试的后端数量。默认为 `2`。 |
| **图床托管** | | |
| `IMAGE_HOSTING_ENABLED` | - | 设置为 `true` 以启用图床托管。缓存将使用 Deno KV 而不是本地文件系统。 |
| `IMAGE_HOSTING_PROVIDER` | 若托管已启用 | `smms` \| `picgo` \| `cloudflare_imgbed` |
| `IMAGE_HOSTING_KEY` | (取决于服务商) | `smms` 或 `picgo` 的 API 密钥。 |
| `IMAGE_HOSTING_URL` | (取决于服务商) | `picgo` 或 `cloudflare_imgbed` 的上传端点。 |
| `IMAGE_HOSTING_AUTH_CODE` | (取决于服务商) | `cloudflare_imgbed` 的可选认证码。 |
| **LLM 提示词优化** | | |
| `LLM_OPTIMIZATION_ENABLED` | - | 设置为 `true` 以启用提示词优化。 |
| `LLM_OPTIMIZATION_API_URL` | 若优化已启用 | 用于优化的 OpenAI 兼容 API 端点。 |
| `LLM_OPTIMIZATION_TOKEN` | (取决于服务商) | LLM API 的 Bearer Token。 |
| `LLM_OPTIMIZATION_MODEL` | - | 用于优化的模型名称。默认为 `gpt-3.5-turbo`。 |
| `LLM_OPTIMIZATION_TEMPLATE_FILE` | - | 包含提示词模板的文件路径。**优先级最高**。 |
| `LLM_OPTIMIZATION_TEMPLATE` | - | 多行提示词模板字符串 (当未使用文件时)。在 .env 中可使用 `\n` 换行。 |

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
curl "http://localhost:8080/prompt/a red apple?key=a-very-secret-user-key&width=1024&height=1024&seed=7&model=dall-e-3"
```

如果启用了 LLM 优化，"a red apple" 会先被发送到 LLM 服务进行增强，然后使用增强后的提示词生成图像。第一次调用会生成图像并填充缓存。后续的相同调用将立即返回缓存结果。

---

## 🔄 透明后备机制

当所有配置的后端失败或阻止内容时，代理会无缝地后备到 Pollinations.ai：

1.  **直接下载**：直接从 Pollinations.ai 下载图像（不是重定向）。
2.  **本地缓存**：下载的图像使用与后端图像相同的缓存系统。
3.  **透明服务**：用户直接接收图像数据，无需了解后备机制。
4.  **性能优化**：消除重定向步骤，为后续请求启用本地缓存。
5.  **增强提示词**：后备机制现在会使用经过 LLM 优化的提示词（如果已启用），以期从后备服务商处也获得更好的结果。

**后备 URL 格式：**
```
https://image.pollinations.ai/prompt/{optimized_description}?model=flux-pro&nofeed=true&width={width}&height={height}
```

---

## 📝 注意事项

-   **LLM 提示词优化**：
    -   启用后，原始提示词会根据模板发送到配置的 LLM API 进行增强。
    -   系统会自动解析返回内容，优先提取 `<prompt>` 标签内的文本，否则会清理并使用全部返回内容。
    -   如果优化过程失败或返回空内容，系统将安全地回退到使用原始提示词。
    -   缓存键仍然基于**原始提示词**生成，但**优化后的提示词**会与结果一同被缓存，以便在后续请求中复用，避免重复优化。
-   **后端支持**：代理自动处理来自后端的 Base64 图像数据和 URL 响应。
-   **智能重试逻辑**：配置 `BLOCKED_RETRY_ATTEMPTS` 控制内容被阻止时尝试多少个后端（默认：2）。
-   **内容审核**：被阻止的提示词会被缓存以防止重复处理。缓存的被阻止内容会自动触发透明后备机制。
-   **负载均衡**：使用 `BACKEND_WEIGHTS` 控制后端间的流量分配（权重越高 = 请求越多）。
-   **模型映射**：使用 `MODEL_MAP` 为每个后端转换模型名称，实现不同提供商间的兼容性。
-   **身份验证**：`TOKEN_MAP` 允许每个后端使用独立的 token，`AUTH_TOKEN` 作为全局后备。
-   如果 `IMAGE_HOSTING_ENABLED=false`（默认），代理会将图像二进制文件写入本地的 `CACHE_DIR` 目录。这是标准的自托管缓存模式。
-   缓存键是请求参数组合的 SHA-256 哈希值：`prompt|width|height|model|seed`。更改任何参数都会生成一张新图像。

---

基于 Deno + TypeScript 构建。
