# API Proxy Frontend Usage Guide

## Quick Start

The dynamic API proxy allows your frontend to request any external URL without CORS issues.

**Base URL:** `https://law-ai.top:9000/proxy`

**Usage:** Add `?target=<encoded_url>` to the proxy endpoint.

## URL Encoding

Always URL-encode the target parameter to avoid issues with special characters:

```javascript
const targetUrl = 'https://api.github.com/users/octocat';
const encoded = encodeURIComponent(targetUrl);
const proxyUrl = `https://law-ai.top:9000/proxy?target=${encoded}`;
```

## Supported Methods

| Method | Support |
|--------|---------|
| GET | Yes |
| POST | Yes |
| PUT | Yes |
| DELETE | Yes |
| PATCH | Yes |
| OPTIONS | Yes (preflight) |

## Request Headers

The proxy forwards these headers to the target API:

| Header | Forwarded |
|--------|-----------|
| Authorization | Yes |
| Content-Type | Yes |
| Accept | Yes |
| User-Agent | Yes |

Any other custom headers may not be forwarded. Use standard headers when possible.

## Code Examples

### Fetch API (GET)

```javascript
const targetUrl = encodeURIComponent('https://api.github.com/users/octocat');

fetch(`https://law-ai.top:9000/proxy?target=${targetUrl}`, {
    headers: {
        'Authorization': 'Bearer YOUR_TOKEN',
        'Accept': 'application/json'
    }
})
.then(res => res.json())
.then(data => console.log(data));
```

### Fetch API (POST)

```javascript
const targetUrl = encodeURIComponent('https://api.openai.com/v1/chat/completions');

fetch(`https://law-ai.top:9000/proxy?target=${targetUrl}`, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer YOUR_API_KEY'
    },
    body: JSON.stringify({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello!' }]
    })
})
.then(res => res.json())
.then(data => console.log(data));
```

### Axios

```javascript
import axios from 'axios';

const targetUrl = encodeURIComponent('https://api.github.com/repos/anthropics/anthropic-sdk-python');

axios.get(`https://law-ai.top:9000/proxy?target=${targetUrl}`, {
    headers: {
        'Authorization': 'Bearer YOUR_TOKEN'
    }
})
.then(response => console.log(response.data));
```

### Axios POST

```javascript
import axios from 'axios';

const targetUrl = encodeURIComponent('https://api.example.com/data');

axios.post(`https://law-ai.top:9000/proxy?target=${targetUrl}`, {
    field1: 'value1',
    field2: 'value2'
}, {
    headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer YOUR_TOKEN'
    }
})
.then(response => console.log(response.data));
```

## Error Handling

The proxy returns JSON error responses:

### Missing Target Parameter

```json
{
    "error": "missing_target",
    "message": "Query parameter target is required. Example: /proxy?target=https://api.github.com/users"
}
```

HTTP Status: 400

### Invalid URL

```json
{
    "error": "invalid_url",
    "message": "target must be a valid http:// or https:// URL"
}
```

HTTP Status: 400

### Target Server Error

If the target server returns an error, the proxy forwards that error response.

## Common Issues

### 1. URL Not Encoded

**Problem:** Special characters in target URL cause parsing errors.

**Solution:** Always use `encodeURIComponent()`.

```javascript
// Wrong
const url = `https://law-ai.top:9000/proxy?target=https://api.example.com/path?a=1&b=2`;

// Correct
const target = encodeURIComponent('https://api.example.com/path?a=1&b=2');
const url = `https://law-ai.top:9000/proxy?target=${target}`;
```

### 2. Custom Headers Not Forwarded

**Problem:** Custom headers like `X-Custom-Header` are not forwarded.

**Solution:** Use standard headers (Authorization, Content-Type, Accept) or contact backend team to add support.

### 3. Timeout Errors

**Problem:** Request takes too long and times out.

**Solution:** The proxy has a 30-second timeout. For long-running requests, consider using a different approach.

## Health Check

Check if the proxy service is running:

```bash
curl https://law-ai.top:9000/health
```

Response:
```json
{"status":"ok","service":"dynamic-proxy","port":9000}
```

## CORS Support

The proxy adds CORS headers to all responses:

- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE, PATCH`
- `Access-Control-Allow-Headers: Authorization, Content-Type, Accept, ...`

You can make requests from any frontend application without CORS errors.

---

## Self-Check Guide (When Proxy Not Working)

If the proxy service is not responding, follow these steps to diagnose.

### Step 1: Connect to Server

```bash
ssh ubuntu@law-ai.top
```

### Step 2: Check Container Status

```bash
cd ~/gateway
docker ps | grep nginx-gateway
```

**Expected:** See `nginx-gateway` container with status `Up`

**If not running:**
```bash
docker-compose up -d
```

### Step 3: Test Health Endpoint

```bash
curl -k https://law-ai.top:9000/health
```

**Expected:** `{"status":"ok","service":"dynamic-proxy","port":9000}`

### Step 4: Check Error Logs

```bash
# Proxy error log
docker exec nginx-gateway cat /var/log/nginx/proxy_error.log | tail -20

# Container log
docker logs nginx-gateway --tail 50
```

### Step 5: Restart Service (Most Common Fix)

Most issues can be resolved by restarting:

```bash
cd ~/gateway && docker-compose restart nginx-gateway
```

Wait 5 seconds, then test health endpoint again.

### Step 6: Reload nginx Config

```bash
docker exec nginx-gateway nginx -s reload
```

### Quick Troubleshooting Table

| Issue | Solution |
|-------|----------|
| Container not running | `docker-compose up -d` |
| Health check failed | Restart container |
| Request timeout | DNS/network issue, retry later |
| Config syntax error | Contact ops team |

### When to Contact Ops

If above steps don't work, contact ops team with:
1. `docker logs nginx-gateway --tail 100`
2. `docker exec nginx-gateway nginx -t` result
3. Specific request URL and error message