# Runner API demo (Chunk 4)

Assuming runner is exposed via port-forward:

```bash
kubectl -n mcp-system port-forward svc/mcp-runner 8080:8080
```

## Negative test: non-allowlisted registry denied (403)
```bash
curl -i -sS -X POST http://127.0.0.1:8080/runs \
  -H 'Content-Type: application/json' \
  -d '{"image_ref":"docker.io/library/alpine:latest","network_policy_profile":"deny-all"}'
```

## Create run (allowlisted image)
```bash
curl -sS -X POST http://127.0.0.1:8080/runs \
  -H 'Content-Type: application/json' \
  -d '{
    "image_ref": "cgr.dev/chainguard/curl:latest",
    "command": ["sh","-c"],
    "args": ["echo hello && nslookup example.com || true && curl -sS --max-time 3 https://example.com || true"],
    "cpu": "100m",
    "memory": "128Mi",
    "timeout_seconds": 60,
    "network_policy_profile": "deny-all"
  }'
```
Expected response includes:
- `image_digest` (sha256)
- `policy_evidence.registry_allowed = true`
- `policy_evidence.signature_verified = true`

Get status:
```bash
curl -sS http://127.0.0.1:8080/runs/<run_id>
```

Get logs:
```bash
curl -sS http://127.0.0.1:8080/runs/<run_id>/logs
```

Stop run:
```bash
curl -i -X POST http://127.0.0.1:8080/runs/<run_id>/stop
```
