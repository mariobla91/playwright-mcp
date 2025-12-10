# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Architecture

**This repository is a distribution package wrapper** for the Playwright MCP server. The actual MCP server implementation lives in the [Playwright monorepo](https://github.com/microsoft/playwright) at `packages/playwright/src/mcp/`.

### Key Files

- `cli.js` - CLI entry point that spawns the MCP server via `decorateCommand()` from `playwright/lib/mcp/program`
- `index.js` - Programmatic API that exports `createConnection()` from `playwright/lib/mcp/index`
- `config.d.ts` - TypeScript definitions for MCP configuration (copied from Playwright monorepo)
- `extension/` - Chrome/Edge browser extension for connecting MCP to existing browser tabs via CDP

### Development Model

**Changes to core MCP functionality must be made in the Playwright monorepo**, not here. This repository:
1. Wraps the core implementation
2. Provides distribution-specific tests
3. Contains the browser extension
4. Manages README documentation and configuration examples

## Commands

### Testing

```bash
# Run all tests (Chrome browser)
npm test
# or
npm run ctest

# Run tests in specific browsers
npm run ftest  # Firefox
npm run wtest  # WebKit

# Run Docker-specific tests
npm run dtest  # Sets MCP_IN_DOCKER=1 and runs chromium-docker project

# Debug tests with verbose output
PWMCP_DEBUG=1 npm test
```

Test configuration uses Playwright Test with custom fixtures in `tests/fixtures.ts`. Tests spawn MCP clients that connect via STDIO transport or Docker.

### Linting & Documentation

```bash
# Lint and update README (runs update-readme.js)
npm run lint
# or
npm run update-readme
```

The `update-readme.js` script auto-generates tool documentation and CLI options in README.md. Always run after changing configuration.

### Rolling New Versions

```bash
# Copy config.d.ts from Playwright monorepo and update docs
npm run roll
```

This command:
1. Copies `config.d.ts` from `../playwright/packages/playwright/src/mcp/config.d.ts`
2. Patches import statements to use `playwright` instead of `playwright-core`
3. Runs README update

**Prerequisite**: The Playwright monorepo must be cloned as a sibling directory (`../playwright/`).

### Docker

```bash
# Build Docker image locally
npm run docker-build

# Run container directly (STDIO mode)
docker run -i --rm --init playwright-mcp-dev:latest --headless --browser chromium --no-sandbox

# Run as HTTP/SSE server (for backend services)
docker run -d --rm --init \
  -p 8931:8931 \
  playwright-mcp-dev:latest \
  --headless --browser chromium --no-sandbox --port 8931 --host 0.0.0.0
```

The Dockerfile uses a multi-stage build:
- **base**: Minimal runtime dependencies + Chromium system deps
- **builder**: Full dev dependencies for building
- **browser**: Downloads Chromium browser binary (cached separately)
- **runtime**: Final slim image with only production dependencies

Key Docker configuration:
- Runs as non-root user `node`
- Hardcoded to `--headless --browser chromium --no-sandbox` (with stealth config loaded via `--config playwright-mcp-config.json`)
- Output directory: `/tmp/playwright-output`
- Browser path: `/ms-playwright`

### Publishing

```bash
npm run npm-publish  # Runs clean + test + publish
```

## Working with Core MCP Code

Since the actual MCP implementation is in the Playwright monorepo, follow these steps for core changes:

1. **Clone Playwright monorepo** (sibling to this repo):
   ```bash
   cd ..
   git clone https://github.com/microsoft/playwright
   cd playwright
   ```

2. **Install dependencies and build**:
   ```bash
   npm ci
   npm run watch  # Runs build in watch mode
   npx playwright install
   ```

3. **MCP source location**: `packages/playwright/src/mcp/`

4. **Run MCP tests in Playwright monorepo**:
   ```bash
   npm run mcp-ctest  # Fast: Chromium only
   npm run mcp-test   # Slow: All browsers
   ```

5. **Lint before PR**:
   ```bash
   npm run flint
   ```

6. **Make changes** in Playwright monorepo, then sync to this repo:
   ```bash
   cd ../playwright-mcp
   npm run roll  # Copies config.d.ts and updates docs
   ```

## Test Architecture

Tests use custom Playwright Test fixtures defined in `tests/fixtures.ts`:

- **`startClient()`** - Spawns MCP server as child process and creates MCP client
- **`client`** - Pre-configured MCP client ready for use
- **`server`** / **`httpsServer`** - Test HTTP servers for testing navigation/network features
- **`cdpServer`** - Launches browser with CDP endpoint for testing CDP connections
- **`wsEndpoint`** - WebSocket endpoint for testing remote browser connections

### Test Projects

- `chrome` - Default Chrome tests
- `chromium-docker` - Docker-based tests (only when `MCP_IN_DOCKER=1`)

Tests automatically:
- Add `--no-sandbox` on Linux CI
- Add `--headless` when `headless` fixture is true
- Generate temporary config files for config-based tests
- Capture stderr for debugging

### Response Parsing

Tool responses are parsed into sections via `parseResponse()`:
- `result` - Main result content
- `code` - Generated Playwright code
- `tabs` - Open tabs state
- `pageState` - Current page state
- `consoleMessages` - New console messages
- `modalState` - Dialog state
- `downloads` - Downloaded files
- `isError` - Whether response is an error

Use custom matcher: `expect(response).toHaveResponse({ result: '...' })`

## Browser Extension

Located in `extension/`, this Chrome/Edge extension bridges MCP to existing browser tabs:

- `extension/src/background.ts` - Service worker that manages connections
- `extension/src/relayConnection.ts` - CDP relay implementation
- `extension/tests/` - Extension-specific tests (macOS only in CI)

Extension uses Chrome DevTools Protocol to inject Playwright capabilities into existing tabs, allowing MCP to leverage user's logged-in sessions.

## Configuration System

MCP server configuration is defined in `config.d.ts` (TypeScript types) and supports:

- **Browser options**: `browserName`, `isolated`, `userDataDir`, `launchOptions`, `contextOptions`
- **Connection modes**: `cdpEndpoint`, `remoteEndpoint`
- **Server settings**: `port`, `host`, `allowedHosts`
- **Capabilities**: `core`, `vision`, `pdf`, `tabs`, `install`, `tracing`, `testing`
- **Network filtering**: `allowedOrigins`, `blockedOrigins`
- **Initialization scripts**: `initScript[]`
- **Session management**: `sharedBrowserContext` - Reuses browser context across clients

Config can be provided via:
1. CLI arguments (e.g., `--browser=firefox`)
2. JSON config file via `--config=path/to/config.json`
3. Programmatic API via `createConnection({ ... })`

**Default production config**: The `playwright-mcp-config.json` file contains the default configuration with stealth settings for WAF bypass and session persistence. **Future configuration rules should be added to `playwright-mcp-config.json`** rather than hardcoding in Dockerfile or CLI defaults, allowing easier updates and flexibility across deployments.

## Contributing Guidelines

Per `CONTRIBUTING.md`:

- **Every contribution requires an issue** (except minor docs)
- **Core changes go to Playwright monorepo**, not here
- **Commit message format**: `label(namespace): title` using Semantic Commit Messages
- **CLA required**: Microsoft Contributor License Agreement
- **High bar for dependencies**: Discuss in issue before adding/updating deps
- **Tests required**: Add tests for new functionality (except pure refactoring)
- **Code style**: Enforced via `npm run flint` in Playwright repo

## Connection Modes

MCP server supports three transport modes:

1. **STDIO** (default): Client spawns server as child process
2. **HTTP/SSE**: Server runs standalone on port (`--port 8931`), clients connect via HTTP
3. **Extension**: Chrome extension bridges to existing tabs (`--extension`)

### Azure Deployment for Backend Services

When deploying to Azure (e.g., Azure Container Apps, Azure Container Instances, App Service), use HTTP/SSE mode to make the MCP server accessible to backend services:

**Docker deployment:**
```bash
# Build and tag for Azure Container Registry
docker build -t <your-acr>.azurecr.io/playwright-mcp:latest .
docker push <your-acr>.azurecr.io/playwright-mcp:latest
```

**Container startup command:**
```bash
node cli.js --headless --browser chromium --no-sandbox --port 8931 --host 0.0.0.0
```

**Backend service connection:**
```json
{
  "mcpServers": {
    "playwright": {
      "url": "http://<container-url>:8931/mcp"
    }
  }
}
```

**Important Azure considerations:**
- Use `--host 0.0.0.0` to bind to all interfaces (default `localhost` won't accept external connections)
- Always use `--headless` and `--no-sandbox` in containerized environments
- Use `--shared-browser-context` to reuse browser state across clients (enabled in default config)
- Configure Azure networking (VNet, NSG) to restrict access to authorized services only
- Set resource limits appropriately (Chromium can be memory-intensive)
- Use Azure Monitor for logging and diagnostics

#### Bypassing WAF Bot Detection

Many WAFs (Web Application Firewalls) detect and block automated browser traffic based on fingerprinting and behavioral patterns. The default Playwright configuration triggers these detections.

**Problem indicators:**
- 403 Forbidden or blocking pages
- CAPTCHAs appearing only from Azure/automated requests
- WAF logs showing "bot activity" or "malicious behavior"
- IP addresses not explicitly blocked but requests still fail

**Solution: Stealth Configuration**

Use the included `playwright-mcp-config.json` configuration file that makes the browser appear more legitimate:

```json
{
  "sharedBrowserContext": true,
  "browser": {
    "browserName": "chromium",
    "isolated": false,
    "launchOptions": {
      "headless": true,
      "channel": "chrome",
      "args": ["--disable-blink-features=AutomationControlled"]
    },
    "contextOptions": {
      "viewport": { "width": 1280, "height": 720 },
      "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "locale": "en-US",
      "timezoneId": "Europe/Oslo",
      "permissions": ["geolocation"],
      "extraHTTPHeaders": {
        "Accept-Language": "en-US,en;q=0.9"
      }
    }
  }
}
```

**Key anti-detection features:**
- `sharedBrowserContext` - Reuses browser context across clients for session persistence
- `--disable-blink-features=AutomationControlled` - Hides `navigator.webdriver` flag
- Custom `userAgent` - Matches real Chrome browser (not "HeadlessChrome")
- `locale` + `timezoneId` - Adds legitimate browser locale signals
- `extraHTTPHeaders` - Adds Accept-Language header like real browsers
- `viewport` - Standard desktop resolution (1280x720)
- `permissions` - Grants typical browser permissions
- `isolated: false` - Persists cookies/sessions between requests

**Deployment configuration:**

The Dockerfile is pre-configured to use this stealth config. When deploying to Azure:

```bash
# Container startup command
node cli.js --config playwright-mcp-config.json --no-sandbox --port 8931 --host 0.0.0.0
```

**Session persistence for authentication:**

The config uses persistent profiles (`userDataDir: "/app/mcp-profile"`) to store:
- Cookies and session tokens
- localStorage and sessionStorage
- Login state

For production deployments:
1. **Mount Azure Files to `/app/mcp-profile`** - Preserves session across container restarts/scaling
2. **OR accept re-login on restart** - Simpler, works if restarts are infrequent

**Troubleshooting WAF blocks:**

If still blocked after using the stealth config:

1. **Verify config is loaded:**
   ```bash
   docker run -i --rm playwright-mcp-dev:latest --config playwright-mcp-config.json
   ```

2. **Check user-agent is applied:**
   - Use `browser_evaluate` tool to run: `() => navigator.userAgent`
   - Should return the custom UA, not "HeadlessChrome"

3. **Advanced: Add initialization script** (if needed):
   Create `stealth.js`:
   ```javascript
   // Additional stealth patches
   Object.defineProperty(navigator, 'webdriver', { get: () => false });
   Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
   delete window.chrome;
   window.chrome = { runtime: {} };
   ```

   Update config:
   ```json
   {
     "browser": {
       "initScript": ["./stealth.js"],
       ...
     }
   }
   ```

4. **Contact WAF provider:**
   - Request whitelisting for specific User-Agent
   - Add custom header for authorized automation
   - Provide IP ranges if needed for fallback

## Common Patterns

### Running MCP Server Locally

```bash
# Standard headed mode
npx @playwright/mcp@latest

# Headless on specific port
npx @playwright/mcp@latest --headless --port 8931

# With specific browser and config
npx @playwright/mcp@latest --browser=firefox --config=./my-config.json

# Docker
docker run -i --rm --init mcr.microsoft.com/playwright/mcp --headless --browser chromium --no-sandbox
```

### Writing Tests

```typescript
import { test, expect } from './fixtures';

test('example test', async ({ client, server }) => {
  // Navigate to test server
  const response = await client.callTool('browser_navigate', {
    url: server.PREFIX + '/input.html'
  });

  // Use custom matcher
  expect(response).toHaveResponse({
    result: expect.stringContaining('Navigated to')
  });
});
```

### Debugging

```bash
# Enable debug output
DEBUG=pw:mcp:test npm test

# Show stderr in tests
PWMCP_DEBUG=1 npm test

# Run single test
npm test -- tests/core.spec.ts:10
```

## Important Notes

- **MCP tools are auto-generated** in README from actual implementation
- **CLI help is auto-generated** via `update-readme.js`
- **Browser binaries** must be installed via `npx playwright install`
- **Persistent profiles** stored at `~/.cache/ms-playwright/mcp-{channel}-profile` (Linux)
- **Isolated mode** creates temporary profiles that are destroyed on close
- **Extension mode** requires "Playwright MCP Bridge" extension installed in Chrome/Edge
