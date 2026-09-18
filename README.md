# HarborGate

A secure Emby and Jellyfin user lifecycle control panel, packaged for Bunny.net Magic Containers.

## Published container image

The GitHub Actions workflow at `.github/workflows/publish-container.yml` builds the Dockerfile and publishes a private image to GitHub Container Registry whenever `main` is updated. It can also be started manually from the repository's **Actions** tab.

The image name is:

```text
ghcr.io/<github-owner>/<repository>:latest
```

GitHub image names are lowercase. The completed workflow displays the exact image URI in its run summary.

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

Create API keys in the Emby and Jellyfin dashboards and add them as secret environment variables in Bunny. Do not bake them into the image. Interactive panel access still requires administrator credentials for the selected server.

Without a server's API key, its profile management works normally, but background expiration enforcement only runs while a HarborGate administrator session for that server is active.

## Persistent storage

Attach a Bunny persistent volume at `/data`. HarborGate stores only expiration dates and the last 100 automatic expiration/reactivation events there. Administrator passwords and session tokens are never written to disk.

Bunny volumes are per-pod and are not automatically replicated or backed up. Keep the application at one replica and include the volume in your own backup plan if expiration history is critical.

## Security notes

- Emby and Jellyfin credentials are sent only to the HarborGate backend and the selected fixed server.
- Sessions use HTTP-only, same-site cookies and CSRF tokens.
- The production image runs as an unprivileged user.
- Browser security headers block framing and restrict scripts, connections, and media to HarborGate itself.
- The public health endpoint contains no credentials or server details.
