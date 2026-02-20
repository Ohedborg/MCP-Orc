# Runner API demo (Chunk 3)

Assuming runner is exposed via port-forward:

```bash
kubectl -n mcp-system port-forward svc/mcp-runner 8080:8080
```

Create run:
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
