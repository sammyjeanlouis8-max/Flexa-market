---
name: DigitalOcean manual deploy required
description: deploy_on_push is enabled in DO spec but does NOT trigger automatically — every push needs a manual deployment call.
---

## Rule
After every `git push github main`, always trigger a manual DO deployment:

```bash
DO_TOKEN=$(printenv DO_API_TOKEN) && curl -s -X POST \
  "https://api.digitalocean.com/v2/apps/4a94f9b4-6ede-453e-9e8c-f1439d3ade6d/deployments" \
  -H "Authorization: Bearer $DO_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"force_build": true}'
```

Then poll until `phase == ACTIVE`:
```bash
curl -s "https://api.digitalocean.com/v2/apps/4a94f9b4-6ede-453e-9e8c-f1439d3ade6d/deployments/<ID>" \
  -H "Authorization: Bearer $DO_TOKEN" | python3 -c "import json,sys; print('Phase:', json.load(sys.stdin)['deployment']['phase'])"
```

**Why:** `deploy_on_push: true` is set in the app spec but the webhook is not firing reliably. The user confirmed this explicitly — without a manual trigger, changes pushed to GitHub never reach production.

**How to apply:** Every single turn that ends with a `git push github main` MUST also trigger a manual DO deployment and wait for ACTIVE before telling the user the change is live.
