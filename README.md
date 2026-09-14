# HarborGate

A secure Emby user lifecycle control panel, packaged for Bunny.net Magic Containers.

## Bunny Magic Containers configuration

Build and publish the included `Dockerfile` to a container registry, then create a Magic Container using that image with these settings:

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
| `HARBORGATE_EMBY_API_KEY` | Recommended | None | Emby API key used by background expiration enforcement when no admin is signed in |

Create the Emby API key in the Emby dashboard and add it as a secret environment variable in Bunny. Do not bake it into the image. Interactive panel access still requires Emby administrator credentials.

Without `HARBORGATE_EMBY_API_KEY`, profile management works normally, but background expiration enforcement only runs while at least one HarborGate administrator session is active.

## Persistent storage

Attach a Bunny persistent volume at `/data`. HarborGate stores only expiration dates and the last 100 automatic expiration/reactivation events there. Administrator passwords and session tokens are never written to disk.

Bunny volumes are per-pod and are not automatically replicated or backed up. Keep the application at one replica and include the volume in your own backup plan if expiration history is critical.

## Security notes

- Emby credentials are sent only to the HarborGate backend and the configured Emby server.
- Sessions use HTTP-only, same-site cookies and CSRF tokens.
- The production image runs as an unprivileged user.
- Browser security headers block framing and restrict scripts, connections, and media to HarborGate itself.
- The public health endpoint contains no credentials or server details.
