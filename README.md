# HarborGate

A secure Emby and Jellyfin user lifecycle control panel, packaged for Bunny.net Magic Containers.

## Published container images

The GitHub Actions workflow at `.github/workflows/publish-container.yml` builds separate linux/amd64 master and child images and publishes both to GitHub Container Registry whenever `main` is updated. It can also be started manually from the repository's **Actions** tab.

The image names are:

```text
ghcr.io/<github-owner>/<repository>:latest
ghcr.io/<github-owner>/<repository>-child:latest
```

The master uses the first image. Set `HARBORGATE_CHILD_IMAGE` to the second image; it is built from `Dockerfile.child` and defaults to `HARBORGATE_MODE=child`. GitHub image names are lowercase. The completed workflow displays both exact image URIs in its run summary.

For a private package, connect `ghcr.io` in Bunny **Image Registries** using the GitHub username and a personal access token with `read:packages`. If the repository belongs to an organization with SSO, authorize that token for the organization. Bunny may require the full image URI to be entered rather than listing private packages automatically.

If publishing returns a package permission error, verify that GitHub Actions is allowed to create packages for the repository and that workflow permissions have not been restricted below `packages: write` by an organization policy.

## Bunny Magic Containers configuration

Create a Magic Container using the published `:latest` image with these settings:

| Setting | Value |
| --- | --- |
| Container port | `8080` |
| Public endpoint protocol | HTTP (Bunny terminates public HTTPS) |
| Persistent volume mount | `/data` |
| Recommended replicas | `1` |
| Startup health check | HTTP GET `/api/health` on port `8080` |
| Readiness health check | HTTP GET `/api/health` on port `8080` |
| Liveness health check | HTTP GET `/api/health` on port `8080` |

Use one replica because HarborGate administrator sessions are held in memory and Bunny persistent volumes are independent per pod. Scaling to multiple replicas would split sessions and expiration metadata.

## Environment variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `PORT` | No | `8080` | Nitro HTTP listener port |
| `HOST` | No | `0.0.0.0` | Nitro listener address |
| `HARBORGATE_DATA_DIR` | No | `/data` in the image | Directory for expiration metadata and history |
| `HARBORGATE_EMBY_API_KEY` | Recommended | None | Emby API key for unattended expiration enforcement |
| `HARBORGATE_JELLYFIN_API_KEY` | Recommended | None | Jellyfin API key for unattended expiration enforcement |
| `HARBORGATE_MODE` | No | `master` | Set to `child` only on automatically provisioned instances |
| `BUNNY_API_KEY` | Master deployment | None | Bunny account API key; keep it server-side |
| `HARBORGATE_CHILD_IMAGE` | Master deployment | None | Dedicated `ghcr.io/<owner>/<repository>-child:<tag>` image |
| `BUNNY_REGION_ID` | Master deployment | None | Bunny region used for one-replica child applications |
| `BUNNY_REGISTRY_ID` | Master deployment | None | Required Bunny Magic Containers registry identifier for the child image |
| `HARBORGATE_ENCRYPTION_KEY` | Master deployment | None | Stable 32-byte base64 or 64-character hex AES key |
| `HARBORGATE_BASE_DOMAIN` | No | Bunny hostname | Base domain for automatic child subdomains |
| `BUNNY_DNS_ZONE_ID` | With base domain | None | Bunny DNS zone where child CNAME records are created |

Create API keys in the Emby and Jellyfin dashboards and add them as secret environment variables in Bunny. Do not bake them into the image. Interactive panel access still requires administrator credentials for the selected server.

Without a server's API key, its profile management works normally, but background expiration enforcement only runs while a HarborGate administrator session for that server is active.

## Master deployments

The default master mode adds **HarborGate instances** to the authenticated administrator dashboard. A deployment validates the supplied public HTTPS Emby or Jellyfin address and administrator credentials before creating a dedicated Bunny application with one replica, a 1 GB `/data` volume, health probes, and an HTTPS CDN endpoint.

Set `HARBORGATE_BASE_DOMAIN` and `BUNNY_DNS_ZONE_ID` together to create names such as `<instance>.example.com`. Without both values, the child uses its Bunny-generated hostname. The master stores the submitted media-server credentials encrypted with AES-256-GCM; keep `HARBORGATE_ENCRYPTION_KEY` stable and secret. Child deployments receive the validated media-server address and session token, not the plaintext password.

For SSRF protection, deployment accepts only HTTPS server addresses that resolve entirely to public IP addresses and does not follow redirects. Private, loopback, link-local, and metadata-network targets are rejected.

## Persistent storage

Attach a Bunny persistent volume at `/data`. Child instances store expiration dates and the last 100 automatic expiration/reactivation events. The master additionally stores its instance registry and AES-GCM-encrypted media administrator credentials. Session tokens remain in memory.

Bunny volumes are per-pod and are not automatically replicated or backed up. Keep every application at one replica and include the volume in your own backup plan if instance metadata or expiration history is critical.

## Security notes

- Emby and Jellyfin credentials are sent only to the HarborGate backend and the selected or provisioned server.
- Sessions use HTTP-only, same-site cookies and CSRF tokens.
- The production image runs as an unprivileged user.
- Browser security headers block framing and restrict scripts, connections, and media to HarborGate itself.
- The public health endpoint contains no credentials or server details.
