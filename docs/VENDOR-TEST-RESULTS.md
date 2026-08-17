# Vendor test results

**Date:** 2026-08-17
**Target:** Goody SANDBOX (`api.sandbox.ongoody.com`)
**Verdict:** Not run — the environment still blocks vendor APIs.

The session's network gateway refuses the connection outright, so none of
the tests (`npm run test:vendors`, the `--order-goody` order placement, or
`npm run sync:catalogue`) could reach the Goody sandbox.

## Evidence

Network pre-flight:

```
$ curl -s -o /dev/null -w "%{http_code}" https://api.sandbox.ongoody.com/v1/products
000
```

The agent proxy's status endpoint shows the cause — the gateway denies the
CONNECT by policy, not a transient failure:

```
"recentRelayFailures": [
  {
    "ts": "2026-08-17T05:02:46.766Z",
    "kind": "connect_rejected",
    "detail": "gateway answered 403 to CONNECT (policy denial or upstream failure)",
    "host": "api.sandbox.ongoody.com:443"
  }
]
```

## What unblocks this

Allow `api.sandbox.ongoody.com` in the remote environment's network policy
(Claude Code on the web → environment settings), then re-run:

1. `npm run test:vendors` — read-only auth + product pre-flight
2. `npm run test:vendors -- --order-goody` — one sandbox order
3. `npm run sync:catalogue` — catalogue overlay refresh
