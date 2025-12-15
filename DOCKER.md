# Docker Image: Stealth Configuration for WAF Bypass

## Overview

This Docker image provides Playwright MCP server with stealth configuration to bypass Web Application Firewall (WAF) bot detection. The image uses multi-stage builds for optimal caching and includes anti-fingerprinting features.

## What's Included for Stealth/WAF Bypass

### Critical Files

| File | Purpose |
|------|---------|
| `playwright-mcp-config.json` | Browser stealth configuration with custom user agent, headers, and anti-detection flags |
| `stealth-init.js` | JavaScript patches to hide automation signals |
| `cli.js` | MCP server entry point |

### Stealth Features in `playwright-mcp-config.json`

```json
{
  "browser": {
    "isolated": true,
    "initScript": ["./stealth-init.js"],
    "launchOptions": {
      "args": [
        "--disable-blink-features=AutomationControlled"  // Hides navigator.webdriver
      ]
    },
    "contextOptions": {
      "userAgent": "Mozilla/5.0 ... Chrome/131.0.0.0 Safari/537.36",  // Real Chrome UA
      "locale": "en-US",
      "timezoneId": "Europe/Oslo",
      "extraHTTPHeaders": {
        "Accept-Language": "en-US,en;q=0.9",
        // ... realistic browser headers
      }
    }
  }
}
```

**Key anti-detection techniques**:
- Custom user agent (not "HeadlessChrome")
- Disables automation control features
- Adds realistic locale/timezone signals
- Includes typical browser HTTP headers
- Runs stealth initialization script before page loads

## Build and Push to Azure Container Registry

### Build with ACR Tag
```bash
# Build directly with ACR tag
docker build -t getuploadedcr.azurecr.io/playwright/mcp:3.0.0 .
```

### Login to Azure Container Registry
```bash
# Option 1: Using Azure CLI
az acr login --name getuploadedcr

# Option 2: Using Docker credentials
docker login getuploadedcr.azurecr.io
```

### Push to ACR
```bash
docker push getuploadedcr.azurecr.io/playwright/mcp:3.0.0
```

### Tag Multiple Versions
```bash
# Tag as latest
docker tag getuploadedcr.azurecr.io/playwright/mcp:3.0.0 \
  getuploadedcr.azurecr.io/playwright/mcp:latest

# Push latest tag
docker push getuploadedcr.azurecr.io/playwright/mcp:latest
```

### Complete Build and Push Workflow
```bash
# 1. Build the image
docker build -t getuploadedcr.azurecr.io/playwright/mcp:3.0.0 .

# 2. Login to ACR
az acr login --name getuploadedcr

# 3. Push the image
docker push getuploadedcr.azurecr.io/playwright/mcp:3.0.0

# 4. Optionally tag and push as latest
docker tag getuploadedcr.azurecr.io/playwright/mcp:3.0.0 \
  getuploadedcr.azurecr.io/playwright/mcp:latest
docker push getuploadedcr.azurecr.io/playwright/mcp:latest
```

## Build Process

### Multi-Stage Architecture

```
1. Base Stage → Install Node.js deps + Chromium system deps
2. Browser Stage → Download Chromium binary (cached separately)
3. Runtime Stage → Combine everything into final slim image
```

### What Gets Copied to Final Image

Line 62 in Dockerfile:
```dockerfile
COPY --chown=${USERNAME}:${USERNAME} cli.js package.json playwright-mcp-config.json stealth-init.js ./
```

**Important**: Only these 4 files are copied from your source. Any new stealth scripts must be added here.

## Running with Stealth Configuration

### Default Behavior

The container automatically loads stealth config via ENTRYPOINT:
```dockerfile
ENTRYPOINT ["node", "cli.js", "--config", "playwright-mcp-config.json", "--no-sandbox", "--isolated"]
```

**Flags explained**:
- `--config playwright-mcp-config.json` - Loads stealth settings
- `--no-sandbox` - Required for Docker
- `--isolated` - Fresh profile per session (no state persistence)

### STDIO Mode
```bash
docker run -i --rm --init getuploadedcr.azurecr.io/playwright/mcp:3.0.0
```

### HTTP/SSE Server Mode (for Azure)
```bash
docker run -d --rm --init \
  -p 8931:8931 \
  getuploadedcr.azurecr.io/playwright/mcp:3.0.0 \
  --port 8931 --host 0.0.0.0
```

**Critical for Azure**: Use `--host 0.0.0.0` to accept external connections.

## Azure Deployment

### Container Startup Command
```bash
node cli.js --config playwright-mcp-config.json --no-sandbox --isolated --port 8931 --host 0.0.0.0
```

### Azure Container Apps Configuration
```json
{
  "properties": {
    "configuration": {
      "ingress": {
        "external": true,
        "targetPort": 8931
      }
    },
    "template": {
      "containers": [{
        "image": "getuploadedcr.azurecr.io/playwright/mcp:3.0.0",
        "name": "playwright-mcp",
        "resources": {
          "cpu": 1.0,
          "memory": "2Gi"
        },
        "command": ["node", "cli.js", "--config", "playwright-mcp-config.json",
                    "--no-sandbox", "--isolated", "--port", "8931", "--host", "0.0.0.0"]
      }]
    }
  }
}
```

### Azure Considerations for Stealth
- **Memory**: Set 2GB minimum (Chromium is memory-intensive)
- **Networking**: Use VNet to restrict access to authorized services only
- **Monitoring**: Use Azure Monitor to track WAF block rates
- **IP Reputation**: Consider using Azure API Management with custom domains to avoid cloud IP detection

## Customizing Stealth Configuration

### Option 1: Modify Files Before Build

1. Edit `playwright-mcp-config.json` - Change user agent, headers, etc.
2. Edit `stealth-init.js` - Add more browser patches
3. Rebuild: `docker build -t getuploadedcr.azurecr.io/playwright/mcp:3.0.0 .`
4. Push: `docker push getuploadedcr.azurecr.io/playwright/mcp:3.0.0`

### Option 2: Mount Custom Config

```bash
docker run -i --rm --init \
  -v $(pwd)/my-stealth-config.json:/app/my-config.json \
  --entrypoint node \
  getuploadedcr.azurecr.io/playwright/mcp:3.0.0 \
  cli.js --config my-config.json --no-sandbox --isolated
```

## Verifying Stealth Configuration

### Check User Agent
Use MCP tool `browser_evaluate` with:
```javascript
() => navigator.userAgent
```

**Expected**: Should return your custom UA (e.g., `Chrome/131.0.0.0`), NOT "HeadlessChrome"

### Check WebDriver Flag
```javascript
() => navigator.webdriver
```

**Expected**: Should return `undefined` (hidden by `--disable-blink-features=AutomationControlled`)

### Check Config is Loaded
```bash
# Verify config file exists in container
docker run --rm getuploadedcr.azurecr.io/playwright/mcp:3.0.0 cat playwright-mcp-config.json
```

## Session Persistence vs Isolated Mode

### Current: Isolated Mode with Session Separation (`--isolated` + `sharedBrowserContext: false`)

**Default Configuration** (Recommended for E2E Testing):

```json
{
  "sharedBrowserContext": false,
  "browser": {
    "isolated": true,
    "launchOptions": { ... stealth settings ... }
  }
}
```

ENTRYPOINT: `node cli.js --config playwright-mcp-config.json --browser chromium --no-sandbox --isolated --port 8931 --host 0.0.0.0`

**Behavior**:
- ✅ Each HTTP client gets isolated browser context
- ✅ Temporary profiles created per session, deleted when browser closes
- ✅ No session/cookie persistence between clients
- ✅ Perfect for E2E tests requiring clean login state each run
- ✅ All WAF bypass features remain active (stealth user-agent, headers, etc.)
- ✅ More secure, no profile corruption

**Use case**: E2E testing where clean state is critical for login/authentication flows

### Alternative: Persistent Profile (Production Sessions)

To persist sessions across container restarts for production use:

1. **Modify `playwright-mcp-config.json`**:
   ```json
   {
     "sharedBrowserContext": true,
     "browser": {
       "isolated": false,
       "userDataDir": "/app/mcp-profile"
     }
   }
   ```

2. **Update Dockerfile** (line 59-60, before USER switch):
   ```dockerfile
   RUN mkdir -p /app/mcp-profile && chown ${USERNAME}:${USERNAME} /app/mcp-profile
   ```

3. **Remove `--isolated` from ENTRYPOINT** (line 67):
   ```dockerfile
   ENTRYPOINT ["node", "cli.js", "--config", "playwright-mcp-config.json", "--browser", "chromium", "--no-sandbox", "--port", "8931", "--host", "0.0.0.0"]
   ```

4. **Mount volume for persistence**:
   ```bash
   docker run -i --rm --init \
     -v $(pwd)/profile:/app/mcp-profile \
     playwright-mcp-dev:latest
   ```

**Trade-offs**:
- ✅ Sessions persist between container restarts
- ❌ All clients share same browser context (sessions bleed between requests)
- ❌ Not suitable for E2E tests requiring isolation

## Troubleshooting WAF Blocks

### Still Getting Blocked?

1. **Verify stealth config is active**:
   ```bash
   # Check user agent
   docker run --rm getuploadedcr.azurecr.io/playwright/mcp:3.0.0 \
     grep userAgent playwright-mcp-config.json
   ```

2. **Add more browser signals** to `playwright-mcp-config.json`:
   ```json
   "contextOptions": {
     "permissions": ["geolocation", "notifications"],
     "geolocation": {"latitude": 59.9139, "longitude": 10.7522}
   }
   ```

3. **Update stealth-init.js** with additional patches:
   ```javascript
   // Hide plugin inconsistencies
   Object.defineProperty(navigator, 'plugins', {
     get: () => [1, 2, 3, 4, 5]
   });
   ```

4. **Check WAF logs** - Some WAFs block based on:
   - IP reputation (cloud IPs)
   - Request rate (add delays between requests)
   - TLS fingerprinting (not fixable via Playwright)

## Cache Optimization

The multi-stage build caches layers efficiently:

- **Change `playwright-mcp-config.json`** → Only rebuilds final layer (~10 seconds)
- **Change `stealth-init.js`** → Only rebuilds final layer (~10 seconds)
- **Change `package.json`** → Rebuilds all layers (~2 minutes)

This allows fast iteration on stealth configuration without waiting for full rebuilds.

## Related Documentation

- **CLAUDE.md** - Full WAF bypass guide with configuration examples
- **README.md** - General project documentation
- **Dockerfile** - Build definition with all stages
