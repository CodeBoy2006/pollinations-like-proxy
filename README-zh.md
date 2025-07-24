# 类 Pollinations 图像代理服务器

[English Version](./README.md)

*一个超轻量级的代理服务，可通过多个 AI 后端将文本提示词转换为图像，并具备智能缓存、LLM 提示词优化、内容安全重写和可选的云图床托管功能。*

[![Deno](https://img.shields.io/badge/Deno-000000?style=for-the-badge&logo=deno&logoColor=white)](https://deno.land/)
[![OpenAI](https://img.shields.io/badge/OpenAI-Compatible-00A67E?style=for-the-badge&logo=openai&logoColor=white)](https://openai.com/)

---

## ✨ 亮点

| 功能 | 描述 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| **LLM 提示词优化** | (可选) 通过外部 LLM 服务自动优化和增强用户提示词，以获得更佳的图像质量。 |
| **De-NSFW 内容恢复** | (可选) 当提示词被阻止时，自动进行安全重写并重试生成，之后再启用最终后备方案。 |
| **多后端支持** | 加权负载均衡，支持任意数量的 OpenAI 兼容端点，并支持每个后端独立的 token 配置。 |
| **智能重试逻辑** | 可配置的重试次数，当内容被阻止时尝试不同的后端。 |
| **多阶段后备机制** | 无缝使用安全重写的提示词进行重试，若所有尝试失败，最终后备到 Pollinations.ai。 |
| **Base64 和 URL 支持** | 自动处理来自后端的 Base64 图像数据和 URL 响应。 |
| **模型映射** | 为每个后端映射模型名称，实现不同提供商之间的无缝兼容。 |
| **双缓存策略** | 使用 **本地文件系统** (默认) 或 **Deno KV** (当启用图床托管时)。 |
| **内容审核** | 缓存被阻止的提示词，以便在后续请求中立即触发恢复或后备机制。 |
| **可插拔的图床托管** | 内置对 `smms`, `picgo`, 和 `cloudflare_imgbed` 的支持。 |
| **可复现的结果** | 完全控制 `seed` (默认 `42`), `model`, `width`, 和 `height`。 |
| **默认安全** | 用户访问需 `?key=` 参数，管理操作需 `X-Admin-Token` 请求头。 |
| **健康检查端点** | `/status` 提供简单的 JSON 格式的健康与配置状态检查。 |

---

## 🚀 快速开始

1.  在项目根目录创建一个 `.env` 文件并填入您的配置。您还可以创建模板文件，如 `prompt-template.txt` 和 `safe-prompt-template.txt`。

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

    # --- De-NSFW 内容安全重写 (可选) ---
    DE_NSFW_ENABLED=true
    # 与优化功能使用相同的 LLM API 配置
    # 优先从文件加载安全重写模板
    DE_NSFW_TEMPLATE_FILE=./safe-prompt-template.txt
    ```

2.  运行服务器。

    脚本将自动加载并使用 `.env` 文件中的设置。

    ```bash
    # 使用所有必要权限运行
    deno run -A image-gen.ts
    ```

---

## 🔧 配置

通过在项目根目录创建 `.env` 文件或设置环境变量来配置代理。

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
| `LLM_OPTIMIZATION_MODEL` | - | 用于优化的模型名称。默认为 `gpt-4.1-mini`。 |
| `LLM_OPTIMIZATION_TEMPLATE_FILE` | - | 包含提示词模板的文件路径。**优先级最高**。 |
| `LLM_OPTIMIZATION_TEMPLATE` | - | 多行提示词模板字符串。在 .env 中可使用 `\n` 换行。 |
| **内容安全重写** | | |
| `DE_NSFW_ENABLED` | - | 设置为 `true` 以启用对被阻止提示词的安全重写。 |
| `DE_NSFW_TEMPLATE_FILE` | - | 包含安全重写模板的文件路径。**优先级最高**。 |
| `DE_NSFW_TEMPLATE` | - | 用于安全重写的多行模板字符串。 |
| `DE_NSFW_MAX_ATTEMPTS` | - | 安全重写的最大次数。默认为 `2`。 |

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

如果启用了 LLM 优化，"a red apple" 会先被发送到 LLM 服务进行增强。如果后端阻止了增强后的提示词，并且安全重写功能已启用，该提示词将被再次重写以变得更安全，然后重试。第一次成功调用会生成图像并填充缓存。

---

## 🧠 多阶段恢复与后备机制

该代理采用一个健壮的多阶段流程，以最大化图像生成的成功率：

1.  **提示词优化**：如果启用，初始的用户提示词将被增强以提高质量。
2.  **初次生成尝试**：代理使用加权后端池尝试生成图像。
3.  **内容安全重写**：如果后端阻止了提示词，并且 `DE_NSFW_ENABLED=true`，代理会触发一次智能重写，使用专门的安全模板移除潜在的问题内容。
4.  **重试生成**：使用新的、更安全的提示词在后端池中重试图像生成。
5.  **最终后备**：如果以上所有步骤都失败，代理将无缝地后备到 Pollinations.ai，使用最有希望的提示词（优化过的或重写过的）进行最后一次尝试。
    -   图像被直接下载并提供给用户，而不是重定向。
    -   结果会像其他成功生成一样被本地缓存。

这种分层方法显著提高了图像生成的成功率，即使对于可能触发内容过滤器的提示词也是如此。

---

## 📝 注意事项

-   **提示词优化 vs. 安全重写**：
    -   **优化**发生在*第一次*生成尝试*之前*，旨在提高图像*质量*。
    -   **安全重写**发生在生成尝试被*阻止之后*，旨在确保*内容合规*。
    -   这两个功能使用相同的已配置 LLM API，但模板不同。
-   **缓存键逻辑**：缓存键始终基于**原始用户提示词**和参数生成。系统会将最终成功的提示词（优化过的或重写过的）与图像一同缓存，以确保可复现性并避免重复处理。
-   **后端支持**：代理自动处理来自后端的 Base64 图像数据和 URL 响应。
-   **负载均衡**：使用 `BACKEND_WEIGHTS` 控制后端间的流量分配（权重越高 = 请求越多）。
-   **身份验证**：`TOKEN_MAP` 允许每个后端使用独立的 token，`AUTH_TOKEN` 作为全局后备。
-   **缓存存储**：如果 `IMAGE_HOSTING_ENABLED=false`（默认），代理会将图像二进制文件写入本地的 `CACHE_DIR` 目录。启用时，则使用 Deno KV。
-   缓存键是请求参数组合的 SHA-256 哈希值：`prompt|width|height|model|seed`。更改任何参数都会生成一张新图像。

---

基于 Deno + TypeScript 构建。