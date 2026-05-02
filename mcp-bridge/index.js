#!/usr/bin/env node

/**
 * Alpha-Q Terminal MCP Bridge
 *
 * MCP Server that bridges QwenPaw to Alpha-Q Terminal's local HTTP API.
 * Exposes two tools:
 *   1. push_report  - Push full review JSON data to Alpha-Q
 *   2. check_status - Check if Alpha-Q API is running
 *
 * Usage in QwenPaw MCP config:
 * {
 *   "mcpServers": {
 *     "alpha-q": {
 *       "command": "node",
 *       "args": ["C:/Users/96584.TUF-GAMING/WorkBuddy/20260428223711/mcp-bridge/index.js"]
 *     }
 *   }
 * }
 */

const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const http = require("http");
const z = require("zod");

// Alpha-Q Terminal API base URL
const API_HOST = "127.0.0.1";
const API_PORT = 18901;

/**
 * Make an HTTP request to Alpha-Q API
 */
function alphaQRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: API_HOST,
      port: API_PORT,
      path: path,
      method: method,
      headers: body ? { "Content-Type": "application/json" } : {},
      timeout: 10000,
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(parsed.error || `HTTP ${res.statusCode}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error(`Invalid JSON response: ${data.substring(0, 200)}`));
        }
      });
    });

    req.on("error", (e) => {
      if (e.code === "ECONNREFUSED") {
        reject(new Error("Alpha-Q Terminal 未运行或 API 未启动。请先启动 Alpha-Q 3.2+"));
      }
      reject(e);
    });

    req.on("timeout", () => {
      req.destroy();
      reject(new Error("请求超时，Alpha-Q Terminal 可能未响应"));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// Create MCP Server
const server = new McpServer({
  name: "alpha-q-bridge",
  version: "1.0.0",
});

// Tool 1: Push report data to Alpha-Q
server.tool(
  "push_report",
  "将复盘数据推送到 Alpha-Q Terminal。数据必须包含 meta 和 marketOverview 字段。推送成功后 Alpha-Q 界面会自动刷新。",
  {
    data: z.string().describe("完整的 Alpha-Q 复盘 JSON 数据（字符串格式）。必须包含 meta 和 marketOverview 字段。"),
  },
  async ({ data }) => {
    try {
      let parsed;
      try {
        parsed = JSON.parse(data);
      } catch (e) {
        return {
          content: [
            {
              type: "text",
              text: "❌ JSON 解析失败：数据不是有效的 JSON 格式。请检查数据格式后重试。",
            },
          ],
          isError: true,
        };
      }

      // Validate required fields
      if (!parsed.meta || !parsed.marketOverview) {
        return {
          content: [
            {
              type: "text",
              text: "❌ 数据格式错误：缺少 meta 或 marketOverview 字段。请确保数据符合 Alpha-Q 2.1 Schema。",
            },
          ],
          isError: true,
        };
      }

      const result = await alphaQRequest("POST", "/api/update-data", parsed);

      return {
        content: [
          {
            type: "text",
            text: `✅ 推送成功！\n\n` +
              `📅 日期: ${result.date || parsed.meta.date}\n` +
              `📁 数据路径: ${result.dataPath || "data.json"}\n` +
              `📜 历史备份: ${result.historyPath || "history/"}\n\n` +
              `Alpha-Q Terminal 界面已自动刷新。`,
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `❌ 推送失败：${err.message}\n\n请确认 Alpha-Q Terminal 3.2+ 已启动且标题栏显示 API:18901。`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool 2: Check Alpha-Q API status
server.tool(
  "check_status",
  "检查 Alpha-Q Terminal API 是否在线运行。返回 API 版本、端口、运行时间等信息。",
  {},
  async () => {
    try {
      const result = await alphaQRequest("GET", "/api/status");
      return {
        content: [
          {
            type: "text",
            text:
              `🟢 Alpha-Q Terminal API 在线\n\n` +
              `📌 服务: ${result.service}\n` +
              `🔧 版本: ${result.version}\n` +
              `🔌 端口: ${result.port}\n` +
              `⏱️ 运行时间: ${Math.round(result.uptime || 0)}秒\n` +
              `📁 数据路径: ${result.dataPath || "-"}`,
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `🔴 Alpha-Q Terminal API 离线\n\n${err.message}\n\n请先启动 Alpha-Q Terminal 3.2+。`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log to stderr so it doesn't interfere with MCP stdio protocol
  process.stderr.write("[Alpha-Q MCP Bridge] Started, listening on stdio\n");
}

main().catch((err) => {
  process.stderr.write("[Alpha-Q MCP Bridge] Fatal error: " + err.message + "\n");
  process.exit(1);
});
