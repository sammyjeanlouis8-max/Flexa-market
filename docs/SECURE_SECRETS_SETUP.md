# Flexa Market — Secure Secrets Setup

**Never commit tokens. Never paste tokens into chat, code, PRs, or logs.**

There are **two separate secret stores**. You usually need both for Cloud Agents + automatic deploy.

---

## 1) Cursor Cloud Agent secret: `GITHUB_TOKEN` (GitHub PAT)

**Where to paste (secure UI only):**

1. Open your Cloud Agent environment:  
   https://cursor.com/dashboard/cloud-agents/environments/e/70ee1718-d7ea-11f1-ba91-f63b1661ac50  
   (or Dashboard → Cloud Agents → your environment → **Secrets**)
2. Click **Add Secrets** / **Secrets**.
3. Name: `GITHUB_TOKEN` (exact spelling).
4. Value: paste your GitHub Personal Access Token.
5. Type: **Runtime Secret** (redacted from agent transcripts/commits).  
   Do **not** choose plain Environment Variable for a PAT.
6. Save.
7. **Start a new Cloud Agent** after saving (running agents do not receive new secrets).

### Create the PAT on GitHub first

1. GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens**.  
   https://github.com/settings/personal-access-tokens
2. Resource owner / repos: include `sammyjeanlouis8-max/Flexa-market`.
3. Permissions (minimum recommended for agent GitHub API/`gh` use):
   - Repository: **Contents** read (or read/write if needed)
   - **Pull requests** read/write
   - **Issues** read/write (if you want agent issue access)
   - **Metadata** read
4. Generate, copy once, paste only into the Cursor Secrets UI above.
5. Do not paste it into Slack, email, this chat, or a file.

### How authentication uses it

Inside a Cloud Agent, `gh` and GitHub API calls pick up `GITHUB_TOKEN` / `GH_TOKEN` from the environment. Git clone/push still use Cursor’s built-in GitHub App auth.

Verify without printing the value:

```bash
./scripts/verify-github-auth.sh
```

---

## 2) GitHub Actions secret: `DO_API_TOKEN` (DigitalOcean)

Automatic deploy workflow: `.github/workflows/deploy.yml`  
It deploys on **push to `main`** (and optional manual `workflow_dispatch`).

**Where to paste:**

1. Open: https://github.com/sammyjeanlouis8-max/Flexa-market/settings/secrets/actions  
2. **New repository secret** (or update existing)
3. Name: `DO_API_TOKEN` (exact)
4. Value: DigitalOcean API token with App Platform deploy permission
5. Save

**Do not** create a custom GitHub Actions secret named `GITHUB_TOKEN` — that name is **reserved** by GitHub Actions for the built-in job token.

### Existing App Platform app ID

Workflow targets the **existing** Flexa Market app only:

`4a94f9b4-6ede-453e-9e8c-f1439d3ade6d`

Optional override: repository **variable** `DO_APP_ID`  
(Settings → Secrets and variables → Actions → Variables).  
Do **not** create a new DigitalOcean app or database for this workflow.

---

## 3) Deployment workflow status

| Trigger | Behavior |
|---|---|
| Push / merge to `main` | Triggers DigitalOcean deploy (production) |
| `workflow_dispatch` with `dry_run=true` (default) | Checks secrets only — **no deploy** |
| `workflow_dispatch` with `dry_run=false` | Triggers deploy when you explicitly ask |

**Recommended before a real release:** merge the hardened deploy workflow (#46), then run Actions → Deploy to DigitalOcean → `dry_run=true` to confirm `DO_API_TOKEN` without deploying.

**Do not deploy until the owner explicitly approves.**

---

## 4) Checklist

- [ ] Cursor Runtime Secret `GITHUB_TOKEN` added (optional for agents)
- [ ] New Cloud Agent started after adding agent secrets
- [ ] GitHub Actions secret `DO_API_TOKEN` present / updated
- [ ] Confirm target app id `4a94f9b4-6ede-453e-9e8c-f1439d3ade6d`
- [ ] Deploy dry-run from Actions before any real deploy
- [ ] Owner approval before merge-to-main release wave
