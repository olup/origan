# Local Domain Testing with Pebble ACME Server

This guide explains how to test custom domain issuance locally using Pebble (Let's Encrypt's test ACME server) and localtest.me domains.

## Overview

The local setup includes:
- **Pebble**: Local ACME server that mimics Let's Encrypt
- **CoreDNS**: DNS server that serves CNAME records for `*.localtest.me` → `gateway.localtest.me`
- **localtest.me**: Public DNS service where all subdomains resolve to `127.0.0.1`

## Prerequisites

- Docker and Docker Compose installed
- Ports 80, 443, 14000, 15000 available

## Quick Start

### 1. Start the Services

```bash
# Start all services including Pebble and CoreDNS
docker-compose up -d

# Check that Pebble is running
curl -k https://localhost:14000/dir
```

### 2. Configure Environment

The `.env.local` file is already configured for local development:

```bash
ACME_SERVER_URL=https://pebble:14000/dir
ACME_SKIP_TLS_VERIFY=true
DOMAIN_SUFFIX=localtest.me
```

### 3. Add CNAME Record for Your Domain

Before adding a custom domain, you need to add a CNAME record in the CoreDNS zone file.

**Pre-configured domains** - These already have CNAME records and can be used immediately:
- `demo.localtest.me`
- `test.localtest.me`
- `myapp.localtest.me`

**To add a new domain:**

1. Edit `docker/localtest.me.zone` and add your subdomain:
   ```dns
   # Add this line (replace 'mycustomapp' with your subdomain)
   mycustomapp   IN  CNAME   gateway.localtest.me.
   ```

2. Restart CoreDNS to apply changes:
   ```bash
   docker-compose restart coredns
   ```

3. Verify the CNAME is working:
   ```bash
   # From inside control-api or pebble container
   docker exec origan-pebble-1 nslookup mycustomapp.localtest.me
   # Should show: mycustomapp.localtest.me canonical name = gateway.localtest.me
   ```

### 4. Test Domain Issuance

1. Access the admin panel (you'll need to set this up and run control-api)
2. Create a new custom domain: `myapp.localtest.me` (or one you added to the zone file)
3. The control-api will:
   - **Validate DNS**: Check for CNAME `myapp.localtest.me` → `gateway.localtest.me` ✅
   - Contact Pebble ACME server
   - Store HTTP-01 challenge in S3
   - Gateway serves the challenge
   - Pebble validates and issues certificate
   - Certificate stored in S3

4. Access your domain:
   ```bash
   https://myapp.localtest.me
   ```

   **Note**: Browser will show security warning (Pebble CA not trusted). Accept the warning to proceed.

## How It Works

### DNS Resolution Flow

**Inside Docker (for CNAME validation and ACME):**
```
Control API validates myapp.localtest.me
    ↓
DNS CNAME query to CoreDNS (172.20.0.2)
    ↓
CoreDNS returns: myapp.localtest.me → gateway.localtest.me
    ↓
✅ CNAME validation succeeds!
    ↓
Pebble validates HTTP-01 challenge
    ↓
DNS A query: myapp.localtest.me → gateway.localtest.me → 172.20.0.10
    ↓
Pebble connects: http://172.20.0.10:80/.well-known/acme-challenge/...
    ↓
Gateway serves challenge
    ↓
✅ Certificate issued!
```

**From Your Browser (host machine):**
```
Browser accesses myapp.localtest.me
    ↓
Public DNS returns: 127.0.0.1
    ↓
Browser connects to: http://127.0.0.1:80
    ↓
Docker port mapping: host:80 → gateway:80
    ↓
✅ Gateway serves your application!
```

## Architecture

### Docker Network

All services use static IPs on the `172.20.0.0/16` subnet:

| Service | IP Address | Purpose |
|---------|-----------|---------|
| coredns | 172.20.0.2 | DNS server for `*.localtest.me` with CNAME support |
| pebble | 172.20.0.3 | ACME server |
| gateway | 172.20.0.10 | HTTP/HTTPS gateway |
| control-api | 172.20.0.11 | API server |
| runner | 172.20.0.20 | Build runner |
| db | 172.20.0.30 | PostgreSQL |
| minio | 172.20.0.40 | S3-compatible storage |
| nats | 172.20.0.50 | Event bus |

### dnsmasq Configuration

Located at `docker/dnsmasq.conf`:

```conf
# Resolve all *.localtest.me to gateway container
address=/localtest.me/172.20.0.10

# Log queries for debugging
log-queries

# Forward other queries to Google DNS
server=8.8.8.8
```

## Debugging

### Check Pebble Logs

```bash
docker logs -f origan-pebble-1
```

### Check dnsmasq Logs

```bash
docker logs -f origan-dnsmasq-1
```

### Check Gateway Logs (for challenge requests)

```bash
docker logs -f origan-gateway-1 | grep acme-challenge
```

### Test DNS Resolution from Pebble Container

```bash
# Test that Pebble can resolve localtest.me to gateway
docker exec origan-pebble-1 nslookup myapp.localtest.me
# Should return: 172.20.0.10
```

### Manually Test Challenge Endpoint

```bash
# From host machine
curl http://myapp.localtest.me/.well-known/acme-challenge/test-token
```

### Check Certificate with OpenSSL

```bash
echo | openssl s_client -connect myapp.localtest.me:443 -servername myapp.localtest.me 2>/dev/null | openssl x509 -noout -text
```

## Pebble Management API

### Get Root Certificate

```bash
curl -k https://localhost:15000/roots/0 > pebble-ca.pem
```

### Get Intermediate Certificate

```bash
curl -k https://localhost:15000/intermediates/0
```

### Reset Pebble State (clear all certificates)

```bash
curl -k -X POST https://localhost:15000/reset
```

## Trust Pebble CA (Optional)

To avoid browser security warnings, add Pebble's CA to your system trust store:

### macOS

```bash
curl -k https://localhost:15000/roots/0 > pebble-ca.pem
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain pebble-ca.pem
```

### Linux

```bash
curl -k https://localhost:15000/roots/0 > pebble-ca.pem
sudo cp pebble-ca.pem /usr/local/share/ca-certificates/pebble.crt
sudo update-ca-certificates
```

### Remove Pebble CA Later

**macOS:**
```bash
sudo security delete-certificate -c "Pebble Root CA" /Library/Keychains/System.keychain
```

**Linux:**
```bash
sudo rm /usr/local/share/ca-certificates/pebble.crt
sudo update-ca-certificates
```

## Troubleshooting

### Port 53 already in use

If dnsmasq fails to start due to port 53 being in use:

```bash
# Find what's using port 53
sudo lsof -i :53

# On macOS, you might need to stop system DNS
sudo launchctl unload -w /System/Library/LaunchDaemons/com.apple.mDNSResponder.plist
sudo launchctl load -w /System/Library/LaunchDaemons/com.apple.mDNSResponder.plist
```

**Alternative**: Run dnsmasq on a different port and configure Pebble to use it.

### Pebble cannot reach gateway

If validation fails with connection errors:

1. Check dnsmasq is running:
   ```bash
   docker ps | grep dnsmasq
   ```

2. Check gateway is on correct IP:
   ```bash
   docker inspect origan-gateway-1 | grep IPAddress
   # Should show: 172.20.0.10
   ```

3. Test from Pebble container:
   ```bash
   docker exec origan-pebble-1 wget -O- http://172.20.0.10/.well-known/acme-challenge/test
   ```

### Browser cannot access localtest.me

If browser cannot resolve `myapp.localtest.me`:

1. Test public DNS:
   ```bash
   nslookup myapp.localtest.me 8.8.8.8
   # Should return: 127.0.0.1
   ```

2. Check Docker port mapping:
   ```bash
   docker ps | grep gateway
   # Should show: 0.0.0.0:80->80/tcp
   ```

3. Test directly:
   ```bash
   curl http://localhost:80
   ```

## Differences from Production

| Aspect | Local (Pebble) | Production (Let's Encrypt) |
|--------|----------------|----------------------------|
| ACME Server | https://pebble:14000/dir | https://acme-v02.api.letsencrypt.org/directory |
| TLS Verification | Disabled | Enabled |
| Account Key | Optional (auto-generated) | Required (from Pulumi) |
| Domain Suffix | localtest.me | origan.app |
| Certificates | Untrusted by browsers | Trusted globally |
| Rate Limits | None | Yes (50 certs/week) |
| Validation | HTTP-01 to container IP | HTTP-01 to public IP |

## Next Steps

- See [RFC: Local Domain Testing](./plans/2025-10-09-local-domain-testing-with-pebble-acme.md) for implementation details
- See [Certificate Service](../packages/control-api/src/service/certificate.service.ts) for ACME implementation
- See [Gateway ACME Handler](../packages/gateway/src/handlers/acme.ts) for challenge handling

## References

- [Pebble GitHub](https://github.com/letsencrypt/pebble)
- [ACME Protocol (RFC 8555)](https://tools.ietf.org/html/rfc8555)
- [localtest.me](http://readme.localtest.me/)
