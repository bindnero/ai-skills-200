---
name: ssrf-prevention
description: Blocks server-side request forgery by validating outbound URLs against scheme, host, port, and resolved-IP allowlists before any HTTP call. Use when the server fetches user-supplied URLs (webhooks, image/avatar proxies, PDF renderers, link previews, import-from-URL features), or reviewing outbound HTTP client code.
---

# SSRF Prevention

**Use when:** a server-side component will make an HTTP or other outbound network request to an address, hostname, or URL that originated outside the trusted configuration set — including webhooks, importers, preview generators, and file fetchers.
**Do not use when:** the destination is a fixed, configuration-controlled endpoint or a service-mesh name resolved inside a private network you own and the caller cannot influence it.

## Instructions

1. Map every outbound request site and mark its source of the URL: user request, stored user data, third-party API response, or static configuration. Only the last is not attacker-influenced.
2. Prefer redesigning the feature so the server never fetches an arbitrary address: accept an allowlist of predefined providers, accept an uploaded object plus a storage key, or have the client fetch and upload bytes.
3. Where a fetch is unavoidable, validate the URL as a parsed object, not as a string. Parse first, then check the scheme, hostname, port, and path against an allowlist; reject anything unparseable.
4. Allowlist schemes explicitly (`https`, and `http` only if required). Reject `file:`, `gopher:`, `dict:`, `ftp:`, and any scheme the client library might support implicitly.
5. Resolve the hostname to IPs with `getaddrinfo` and check every returned address against blocked ranges. Reject on any match, do not check only the first address — a hostname commonly returns several.
6. Pin the connection to the validated IP to close the DNS rebinding window between check and connect, while setting the `Host` header and verifying TLS SNI and certificate against the original hostname.
7. Reject non-standard ports unless allowlisted. Block cloud metadata endpoints (`169.254.169.254`, `fd00:ec2::254`) and link-local, loopback, private, and unique-local ranges explicitly so cloud credential theft is impossible even if the ranges list drifts.
8. Disable redirect following, or re-run the full validation on each hop with a hop cap. A 302 to `http://169.254.169.254/` is the standard bypass for "we validated the URL".
9. Normalize first: lowercase the host, strip trailing dots, strip embedded credentials, decode percent-encoding before checks, and reject control characters and backslashes that different parsers interpret differently.
10. Log every outbound fetch decision — host, resolved IP, decision, and the initiating user — and alert on rejected requests, since probing indicates active reconnaissance.

## Patterns

Validation before the request (Python):

```python
import ipaddress, socket
from urllib.parse import urlsplit

ALLOWED_SCHEMES = {"https"}
ALLOWED_HOSTS = {"hooks.example.com", "api.partner.io"}
ALLOWED_PORTS = {443}
BLOCKED_NETS = [
    ipaddress.ip_address("0.0.0.0/8"),
    ipaddress.ip_address("10.0.0.0/8"),
    ipaddress.ip_address("100.64.0.0/10"),
    ipaddress.ip_address("127.0.0.0/8"),
    ipaddress.ip_address("169.254.0.0/16"),
    ipaddress.ip_address("172.16.0.0/12"),
    ipaddress.ip_address("192.168.0.0/16"),
    ipaddress.ip_address("224.0.0.0/4"),
    ipaddress.ip_address("240.0.0.0/4"),
    ipaddress.ip_address("::1/128"),
    ipaddress.ip_address("fc00::/7"),
    ipaddress.ip_address("fe80::/10"),
]

def validate_outbound_url(raw: str) -> tuple[str, str, int]:
    if any(ord(ch) < 0x20 or ord(ch) == 0x7F for ch in raw):
        raise ValueError("control characters in url")
    parts = urlsplit(raw.strip())
    if parts.scheme.lower() not in ALLOWED_SCHEMES:
        raise ValueError("scheme not allowed")
    if parts.username or parts.password:
        raise ValueError("embedded credentials not allowed")
    host = (parts.hostname or "").lower().rstrip(".")
    if host not in ALLOWED_HOSTS:
        raise ValueError("host not allowlisted")
    port = parts.port or 443
    if port not in ALLOWED_PORTS:
        raise ValueError("port not allowed")

    for info in socket.getaddrinfo(host, port, proto=socket.IPPROTO_TCP):
        ip = ipaddress.ip_address(info[4][0])
        if any(ip in net for net in BLOCKED_NETS):
            raise ValueError("host resolves to a blocked range")
    return parts.scheme, host, port
```

Pinning the destination to prevent DNS rebinding:

```python
import httpx

def fetch_pinned(url: str, host: str, port: int, ip: str) -> bytes:
    headers = {"Host": host}
    with httpx.Client(timeout=5.0, follow_redirects=False) as client:
        # transport-level connect to the validated IP; TLS SNI still uses `host`
        resp = client.get(
            url.replace(host, ip, 1),
            headers=headers,
            extensions={"sni_hostname": host},
        )
        resp.raise_for_status()
        return resp.content
```

Cloud egress controls that backstop application validation:

```yaml
# Kubernetes NetworkPolicy: workload egress to the internet is proxied only
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-metadata-egress
spec:
  podSelector:
    matchLabels: { app: webhook-worker }
  policyTypes: [Egress]
  egress:
    - to:
        - ipBlock:
            cidr: 0.0.0.0/0
            except:
              - 169.254.0.0/16   # cloud metadata
              - 10.0.0.0/8       # cluster & VPC internals
```

## Checklist

- [ ] Every outbound fetch site is inventoried with the origin of its URL, and attacker-influenced sites are listed.
- [ ] URLs are parsed before validation; scheme, host, and port are checked against explicit allowlists.
- [ ] Hostnames are resolved and every returned IP is checked against loopback, private, link-local, unique-local, multicast, and metadata ranges.
- [ ] Redirects are disabled or re-validated per hop with a hop limit.
- [ ] The connection is pinned to the validated IP to close the DNS rebinding window, with correct `Host` and TLS verification.
- [ ] Embedded credentials, control characters, backslashes, and percent-encoded separators are rejected before checks.
- [ ] The feature was evaluated for redesign: predefined providers or client-side fetch plus upload removes the SSRF surface entirely.
- [ ] Network-level egress policy or a metadata-service hop limit exists as a second, infrastructure-owned control.

## Anti-patterns

- **Validating the URL string but connecting by hostname.** A check-then-connect gap is exploitable with a short-TTL DNS record that returns a public IP for the check and an internal IP for the connect. Pin the resolved IP.
- **Only checking the first resolved address.** DNS returns multiple records; attackers publish one benign and one internal address. Validate every returned address and reject if any is blocked.
- **Allowing redirects.** Validating the initial URL and then following a 302 to an internal address is the single most common SSRF bypass. Disable or re-validate on every hop.
- **Regex on the URL string.** Patterns like `^https://` are defeated by `https://expected.com@169.254.169.254/`, mixed case, percent-encoded characters, and parser disagreement. Use a real URL parser and check components.
- **Application validation as the only control.** SSRF defenses drift out of date as new address ranges and cloud metadata paths appear. Enforce egress restrictions at the network or proxy layer so a missed case cannot reach internal services.