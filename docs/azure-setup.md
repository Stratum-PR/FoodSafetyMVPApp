# Azure setup guide: Stratum FSQMS

How to set up every Azure service the app needs, for a **dev** and a **prod** environment.
Follow it top to bottom; each step says what the service is for, how to create it (Azure
Portal or Azure CLI), and how to check it worked.

> **Status (September 2026):** the app still runs on fictional sample data. Nothing here is
> needed to keep building screens. Set this up before any real customer data (the first
> design partner's pilot) goes into the system.

**Never paste secrets into chat, code, commits or this file.** Secrets go straight into Key
Vault (step 6). IDs such as the subscription ID or tenant ID are not secrets.

---

## 0. What we're building

```
                         app.stratumpr.com (prod) / dev.app.stratumpr.com (dev)
                                           │  HTTPS (managed certificate)
                                           ▼
 GitHub Actions ──push image──▶ Container Registry ──pull──▶ Container Apps (Next.js app)
   (OIDC, no secrets)                                          │  user-assigned managed identity
                                                               ├──▶ Key Vault (secrets)
                                                               ├──▶ Blob Storage (document files)
                                                               │       └─ Defender for Storage (malware scan)
                                                               ├──▶ PostgreSQL Flexible Server (all data)
                                                               └──▶ Application Insights ─▶ Log Analytics
```

| Service | Used for | Needed when |
|---|---|---|
| Resource groups, tags, budgets | Organization and cost control | First |
| Log Analytics + Application Insights | Errors (the reference codes on error pages), logs, alerts | First |
| User-assigned managed identity | The app's identity: reads secrets, files and images without passwords | First |
| Key Vault | Every secret (DB password, auth secrets, email key) | First |
| Container Registry | The app's Docker images | Before the first deploy |
| PostgreSQL Flexible Server | Suppliers, documents, decisions, history, users | Before real data |
| Storage account (Blob) | Uploaded document files | Before real uploads |
| Defender for Storage | Malware scanning of every upload | Before real uploads |
| Container Apps environment + app | Runs the Next.js app | First deploy |
| Custom domain + certificate | `app.stratumpr.com` | Before the pilot |
| Entra app registration (GitHub OIDC) | Deploys from GitHub without stored passwords | First deploy |
| Entra app registration (Microsoft sign-in) | "Sign in with Microsoft" | When sign-in is built |
| Monitor alerts + action group | Emails you when something breaks | Before the pilot |
| **Later:** Document Intelligence, Azure OpenAI, Container Apps Jobs | Reading certificates, AI search, reminders and expiry checks | After the core MVP |

Not in Azure: **sign-in** (Better Auth, inside the app, stored in Postgres), **email** (Resend,
for now), **source code** (GitHub).

---

## 1. Before you start

1. **Tenant and subscription.** Use the Microsoft for Startups (Azure for Startups)
   subscription, in the `stratumpr.com` tenant (admin@stratumpr.com). If the credits
   subscription is still in another tenant, finish the tenant move with Microsoft for Startups
   first; moving resources between tenants later is painful.
2. **Your account** needs the **Owner** role on the subscription (to create role assignments).
3. **Install the tools** (Windows):
   ```bash
   winget install -e --id Microsoft.AzureCLI
   ```
   Then, in a new terminal:
   ```bash
   az login
   az account list --output table
   az account set --subscription "<subscription name or id>"
   az extension add --name containerapp --upgrade
   az extension add --name application-insights --upgrade
   ```
4. **Register the resource providers** once per subscription:
   ```bash
   for p in Microsoft.App Microsoft.OperationalInsights Microsoft.Insights Microsoft.DBforPostgreSQL Microsoft.Storage Microsoft.KeyVault Microsoft.ContainerRegistry Microsoft.ManagedIdentity Microsoft.Security; do az provider register --namespace $p; done
   ```
5. **Region:** `eastus2` (East US 2). It's close to Puerto Rico, has every service we use, and
   usually has capacity. Keep **everything in one region** (data residency and no cross-region
   traffic charges). Check Azure OpenAI model availability there before the AI phase.

### Naming and tags

| Resource | Dev | Prod | Rule |
|---|---|---|---|
| Resource group | `rg-stratum-dev` | `rg-stratum-prod` | |
| Shared resource group | `rg-stratum-shared` (registry) | | |
| Log Analytics | `log-stratum-dev` | `log-stratum-prod` | |
| Application Insights | `appi-stratum-dev` | `appi-stratum-prod` | |
| Managed identity | `id-stratum-dev` | `id-stratum-prod` | |
| Key Vault | `kv-stratum-dev-<4 chars>` | `kv-stratum-prod-<4 chars>` | Globally unique, 3–24 chars |
| Container Registry | `acrstratum<4 chars>` (shared) | | Globally unique, letters and digits only |
| PostgreSQL | `psql-stratum-dev` | `psql-stratum-prod` | Globally unique |
| Storage account | `ststratumdev<4 chars>` | `ststratumprod<4 chars>` | Globally unique, lowercase letters and digits, 3–24 chars |
| Container Apps environment | `cae-stratum-dev` | `cae-stratum-prod` | |
| Container app | `ca-stratum-dev` | `ca-stratum-prod` | |

Use the same 4 random characters everywhere (e.g. `k7q2`). Tag every resource group with
`project=stratum-fsqms`, `env=dev|prod`, `owner=admin@stratumpr.com`.

In a Git Bash terminal, set these once per session (dev shown; repeat everything with
`ENV=prod` for production):

```bash
ENV=dev
LOC=eastus2
SUFFIX=k7q2                      # your 4 random characters
RG=rg-stratum-$ENV
RG_SHARED=rg-stratum-shared
```

---

## 2. Resource groups, budget and cost alerts

```bash
az group create -n $RG -l $LOC --tags project=stratum-fsqms env=$ENV owner=admin@stratumpr.com
az group create -n $RG_SHARED -l $LOC --tags project=stratum-fsqms env=shared owner=admin@stratumpr.com
```

**Budget (Portal is easier):** Cost Management → Budgets → Add. Scope: the subscription.
Monthly amount: what you're willing to spend from credits (e.g. $150 dev + prod during the
pilot). Alerts at **50%, 80% and 100%** actual, and **100% forecasted**, emailed to
admin@stratumpr.com. Add a second budget per resource group if you want dev and prod apart.

Also: Microsoft for Startups portal → check your credit balance and **expiry date** monthly.

**Check:** `az group list -o table` shows both groups; the budget appears under Cost Management.

---

## 3. Log Analytics and Application Insights

Where logs and errors go. The error page's reference code (`digest`) is searchable here.

```bash
az monitor log-analytics workspace create -g $RG -n log-stratum-$ENV -l $LOC --retention-time 30
LAW_ID=$(az monitor log-analytics workspace show -g $RG -n log-stratum-$ENV --query id -o tsv)

az monitor app-insights component create -g $RG -a appi-stratum-$ENV -l $LOC \
  --workspace $LAW_ID --application-type web
```

- Retention: 30 days for dev. For prod, 90 days (Log Analytics → Usage and estimated costs →
  Data retention). The audit trail lives in Postgres, not here.
- **Daily cap** (cost safety): Log Analytics → Usage and estimated costs → Daily cap, e.g.
  1 GB/day dev, 2 GB/day prod.
- Keep the Application Insights **connection string** for step 10 (it's not a secret, but
  store it as an app setting, not in code).

**Check:** both resources exist in the group; App Insights shows "Workspace-based".

---

## 4. Managed identity (the app's identity)

One user-assigned identity per environment. The app uses it to read Key Vault, Blob Storage
and the registry without any stored password.

```bash
az identity create -g $RG -n id-stratum-$ENV -l $LOC
ID_RESOURCE=$(az identity show -g $RG -n id-stratum-$ENV --query id -o tsv)
ID_PRINCIPAL=$(az identity show -g $RG -n id-stratum-$ENV --query principalId -o tsv)
ID_CLIENT=$(az identity show -g $RG -n id-stratum-$ENV --query clientId -o tsv)
```

`ID_CLIENT` becomes the app setting `AZURE_CLIENT_ID`, so the Azure SDK knows which identity
to use.

---

## 5. Container Registry (shared)

One registry for both environments; the same image moves from dev to prod.

```bash
az acr create -g $RG_SHARED -n acrstratum$SUFFIX --sku Basic --admin-enabled false -l $LOC
ACR_ID=$(az acr show -n acrstratum$SUFFIX --query id -o tsv)

# The app may pull images:
az role assignment create --assignee-object-id $ID_PRINCIPAL --assignee-principal-type ServicePrincipal \
  --role AcrPull --scope $ACR_ID
```

Admin user stays **off**: GitHub pushes with OIDC (step 12), the app pulls with its identity.

---

## 6. Key Vault

Every secret lives here; the app reads them at start through its identity.

```bash
az keyvault create -g $RG -n kv-stratum-$ENV-$SUFFIX -l $LOC \
  --enable-rbac-authorization true --retention-days 90 --enable-purge-protection true
KV_ID=$(az keyvault show -n kv-stratum-$ENV-$SUFFIX --query id -o tsv)

# The app may read secrets:
az role assignment create --assignee-object-id $ID_PRINCIPAL --assignee-principal-type ServicePrincipal \
  --role "Key Vault Secrets User" --scope $KV_ID

# You may manage secrets (your own account):
az role assignment create --assignee "$(az ad signed-in-user show --query id -o tsv)" \
  --role "Key Vault Secrets Officer" --scope $KV_ID
```

Purge protection means a deleted secret or vault can't be permanently erased for 90 days;
that's intended (it protects against accidents and attackers). It can't be turned off later.

**Secrets to create** (Portal → Key Vault → Secrets → Generate/Import, so values never pass
through a terminal history). Names use hyphens:

| Secret name | Value | When |
|---|---|---|
| `database-url` | Postgres connection string for the **app** role (step 7) | Step 7 |
| `better-auth-secret` | 32+ random bytes (`openssl rand -base64 32`) | When sign-in is built |
| `resend-api-key` | Resend API key (full access) | When email is built |
| `google-client-secret` | Google OAuth client secret | When sign-in is built |
| `microsoft-client-secret` | Entra app secret (step 13) | When sign-in is built |

**Check:** `az keyvault secret list --vault-name kv-stratum-$ENV-$SUFFIX -o table` works for you.

---

## 7. PostgreSQL Flexible Server

All the app's data: companies, users, suppliers, documents, review decisions, history. Every
table carries `tenant_id` and row-level security keeps companies apart.

**Size:** dev **Burstable B1ms** (1 vCore, 2 GiB). Prod **Burstable B2s** during the pilot;
move to General Purpose when there are several paying customers. Storage 32 GiB with
auto-grow. PostgreSQL **16** or newer.

Portal is recommended here (the options change often): Azure Database for PostgreSQL →
Flexible server → Create.

- **Basics:** resource group `$RG`, name `psql-stratum-$ENV`, region East US 2, version 16+,
  workload type *Development* (dev) / *Production (Small/Medium)* (prod), compute as above,
  high availability **off** (on later for prod if the SLA needs it).
- **Authentication:** *PostgreSQL and Microsoft Entra authentication*. Admin login
  `stratumadmin` with a long generated password. **Save that password straight into Key Vault**
  as `postgres-admin-password`; it's only for migrations and emergencies. Set yourself as the
  Entra admin.
- **Networking:** *Public access*. Firewall rules:
  - **Allow public access from any Azure service** → **Yes** (the app's outbound IPs aren't
    fixed on the Container Apps consumption plan). This lets other Azure customers' services
    reach the login screen, not the data: the password, TLS and the rules below protect it.
    The private-network option ("campus": VNet + private endpoint) is the planned upgrade.
  - Add **your current IP** only while running migrations, and remove it afterwards.
- **Security:** leave TLS enforcement **on** (`require_secure_transport=ON`, minimum TLS 1.2).
- **Backups:** dev 7 days, locally redundant. Prod 14–35 days; geo-redundant backup only if
  you need a copy in another region (it must be chosen at creation and costs more).

After it's created:

```bash
# Extensions the app uses (pgvector for AI search later, pgcrypto for encryption helpers):
az postgres flexible-server parameter set -g $RG -s psql-stratum-$ENV \
  --name azure.extensions --value "VECTOR,PGCRYPTO,CITEXT"

az postgres flexible-server db create -g $RG -s psql-stratum-$ENV -d stratum
```

**App role (least privilege).** The app never uses the admin login. Connect with the admin
once (Portal → Connect, or `psql`) and run:

```sql
CREATE ROLE stratum_app LOGIN PASSWORD '<generated, store in Key Vault>';
GRANT CONNECT ON DATABASE stratum TO stratum_app;
-- Table grants and row-level security policies come from the app's migrations.
```

Then store `database-url` in Key Vault:
`postgresql://stratum_app:<password>@psql-stratum-$ENV.postgres.database.azure.com:5432/stratum?sslmode=require`

**Check:** Portal → the server → Connect works with `sslmode=require`; the `stratum`
database exists; `SHOW azure.extensions;` lists the three extensions.

---

## 8. Storage account (document files)

Uploaded certificates and documents. Files are private: the app hands out short-lived
download links; nothing is public.

```bash
az storage account create -g $RG -n ststratum$ENV$SUFFIX -l $LOC \
  --sku Standard_LRS --kind StorageV2 --min-tls-version TLS1_2 \
  --allow-blob-public-access false --allow-shared-key-access false --https-only true
ST_ID=$(az storage account show -g $RG -n ststratum$ENV$SUFFIX --query id -o tsv)

# Keep deleted or overwritten files recoverable (nothing is ever lost by accident):
az storage account blob-service-properties update -g $RG -n ststratum$ENV$SUFFIX \
  --enable-versioning true \
  --enable-delete-retention true --delete-retention-days 30 \
  --enable-container-delete-retention true --container-delete-retention-days 30

# The app may read and write files:
az role assignment create --assignee-object-id $ID_PRINCIPAL --assignee-principal-type ServicePrincipal \
  --role "Storage Blob Data Contributor" --scope $ST_ID

# You too (to create the container and inspect files):
az role assignment create --assignee "$(az ad signed-in-user show --query id -o tsv)" \
  --role "Storage Blob Data Contributor" --scope $ST_ID

az storage container create --account-name ststratum$ENV$SUFFIX --name documents --auth-mode login
```

- Prod: consider **ZRS** (`Standard_ZRS`) for protection against a datacenter failure.
- Shared-key access is **off**, so connection strings don't work; the app authenticates with
  its identity (and signs download links with a *user delegation key*).
- Files are stored as `documents/<tenant_id>/<document_id>/<file name>`.

**Check:** Portal → the storage account → Containers shows `documents`; "Allow blob anonymous
access" is Disabled; "Allow storage account key access" is Disabled.

---

## 9. Defender for Storage (malware scanning) and Defender for Cloud

Every uploaded file is scanned for malware before anyone opens it.

Portal: Microsoft Defender for Cloud → Environment settings → your subscription →
Defender plans → **Storage: On** → Settings:

- **On-upload malware scanning: On**, with a monthly cap (e.g. **10 GB per storage account**
  in dev, 50 GB in prod), so costs can't run away.
- **Sensitive data threat detection:** optional.
- Enable **"Send scan results to Event Grid"** or keep the default blob index tags. The app
  reads the blob index tag `Malware Scanning scan result` and only shows files marked
  `No threats found`.

Also in Defender for Cloud: keep the **free foundational CSPM** on and review its
recommendations monthly. Don't enable paid plans (Servers, Databases…) yet.

**Check:** upload the harmless EICAR test file to the `documents` container (Portal → Upload).
After a minute, its index tags show a malicious result and Defender raises an alert. Then
delete it.

---

## 10. Container Apps environment and the app

Runs the Next.js app (the `standalone` build, Docker image).

```bash
LAW_CUSTOMER_ID=$(az monitor log-analytics workspace show -g $RG -n log-stratum-$ENV --query customerId -o tsv)
LAW_KEY=$(az monitor log-analytics workspace get-shared-keys -g $RG -n log-stratum-$ENV --query primarySharedKey -o tsv)

az containerapp env create -g $RG -n cae-stratum-$ENV -l $LOC \
  --logs-workspace-id $LAW_CUSTOMER_ID --logs-workspace-key $LAW_KEY
```

The first app revision needs an image. Until the Dockerfile and deploy workflow exist (they
come with the first deploy), create the app with Microsoft's hello-world image and let the
deploy workflow replace it:

```bash
az containerapp create -g $RG -n ca-stratum-$ENV --environment cae-stratum-$ENV \
  --image mcr.microsoft.com/k8se/quickstart:latest \
  --target-port 3000 --ingress external \
  --user-assigned $ID_RESOURCE \
  --registry-server acrstratum$SUFFIX.azurecr.io --registry-identity $ID_RESOURCE \
  --cpu 0.5 --memory 1.0Gi \
  --min-replicas 0 --max-replicas 2      # prod: --min-replicas 1 (always on)
```

**Secrets from Key Vault** (the app reads them through its identity; values never appear in
the container app's settings):

```bash
KV_URI=https://kv-stratum-$ENV-$SUFFIX.vault.azure.net
az containerapp secret set -g $RG -n ca-stratum-$ENV --secrets \
  "database-url=keyvaultref:$KV_URI/secrets/database-url,identityref:$ID_RESOURCE"
# Add better-auth-secret, resend-api-key, google-client-secret, microsoft-client-secret
# the same way once they exist.
```

**Environment variables:**

```bash
APPI_CS=$(az monitor app-insights component show -g $RG -a appi-stratum-$ENV --query connectionString -o tsv)
az containerapp update -g $RG -n ca-stratum-$ENV --set-env-vars \
  NODE_ENV=production \
  AZURE_CLIENT_ID=$ID_CLIENT \
  AZURE_STORAGE_ACCOUNT=ststratum$ENV$SUFFIX \
  AZURE_STORAGE_CONTAINER=documents \
  APPLICATIONINSIGHTS_CONNECTION_STRING="$APPI_CS" \
  DATABASE_URL=secretref:database-url
```

Settings to review in the Portal (the container app → Settings):

- **Scale:** dev min 0 (scales to zero when idle; the first request takes a few seconds). Prod
  **min 1** (always on, as decided).
- **Health probes:** liveness and readiness on HTTP port 3000, path `/` for now (a `/api/health`
  endpoint comes with the deploy step).
- **Ingress:** HTTPS only (*Allow insecure connections* off).
- **Revision mode:** Single for dev; prod can use Multiple for zero-downtime switches.

**Check:** the app's URL (`*.azurecontainerapps.io`) opens the hello-world page.

---

## 11. Custom domain and certificate

Prod: `app.stratumpr.com`. Dev: `dev.app.stratumpr.com`. The certificate is free, managed and
renewed by Azure.

1. Get the app's default hostname and verification ID:
   ```bash
   az containerapp show -g $RG -n ca-stratum-$ENV --query properties.configuration.ingress.fqdn -o tsv
   az containerapp show -g $RG -n ca-stratum-$ENV --query properties.customDomainVerificationId -o tsv
   ```
2. At the DNS provider for `stratumpr.com`, add:
   - `CNAME  app` (or `dev.app`) → the default hostname
   - `TXT    asuid.app` (or `asuid.dev.app`) → the verification ID
3. Bind the domain with a managed certificate:
   ```bash
   az containerapp hostname add  -g $RG -n ca-stratum-$ENV --hostname app.stratumpr.com
   az containerapp hostname bind -g $RG -n ca-stratum-$ENV --hostname app.stratumpr.com \
     --environment cae-stratum-$ENV --validation-method CNAME
   ```

Don't touch the existing records for `stratumpr.com` (the marketing site on Vercel,
`mvp.stratumpr.com`, and the Resend SPF/DKIM/DMARC records).

**Check:** `https://app.stratumpr.com` opens with a valid certificate.

---

## 12. GitHub deploys without secrets (OIDC)

GitHub Actions logs in to Azure with a short-lived token tied to the repository. There's no
password to leak or rotate. Deploys: every merge to `main` → dev automatically; prod with one
click (a GitHub environment with you as the required reviewer).

1. Create an app registration for GitHub: Entra ID → App registrations → New registration →
   `github-stratum-deploy`, single tenant. Note its **Application (client) ID**.
2. Certificates & secrets → **Federated credentials** → Add → *GitHub Actions deploying Azure
   resources*:
   - Organization `Stratum-PR`, repository `FoodSafetyMVPApp`
   - Entity type **Environment**, name `dev` (repeat with `prod`)
3. Give it only what deploys need:
   ```bash
   GH_APP=$(az ad sp list --display-name github-stratum-deploy --query "[0].id" -o tsv)
   az role assignment create --assignee-object-id $GH_APP --assignee-principal-type ServicePrincipal \
     --role AcrPush --scope $ACR_ID
   az role assignment create --assignee-object-id $GH_APP --assignee-principal-type ServicePrincipal \
     --role "Container Apps Contributor" --scope $(az group show -n $RG --query id -o tsv)
   ```
   (If a deploy fails for missing rights, use *Contributor* on the resource group only; never on
   the subscription.)
4. In GitHub → FoodSafetyMVPApp → Settings → Environments: create `dev` and `prod` (prod with
   **Required reviewers: you**). Add these **variables** (not secrets; they're identifiers):
   `AZURE_CLIENT_ID` (the app registration), `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`,
   `ACR_NAME`, `RESOURCE_GROUP`, `CONTAINER_APP`.

The deploy workflow itself comes with the first deploy step.

---

## 13. Microsoft sign-in (when sign-in is built)

For "Sign in with Microsoft" (work and personal accounts).

1. Entra ID → App registrations → New registration → `Stratum FSQMS`.
   - Supported account types: **Accounts in any organizational directory and personal
     Microsoft accounts**.
   - Redirect URI (Web): `https://app.stratumpr.com/api/auth/callback/microsoft`
     (add `https://dev.app.stratumpr.com/…` and `http://localhost:3000/…` for dev).
2. Certificates & secrets → New client secret (24 months) → copy it **directly into Key Vault**
   as `microsoft-client-secret`. Put a calendar reminder a month before it expires.
3. Branding & properties: name, logo, `https://stratumpr.com`, privacy and terms URLs. Complete
   **publisher verification** (needs the Microsoft Partner Network ID) so users don't see an
   "unverified" warning.

Google sign-in is set up in Google Cloud Console (OAuth consent screen + brand verification),
not Azure.

---

## 14. Alerts

Monitor → Alerts → Action groups → Create `ag-stratum` (email admin@stratumpr.com, optionally
SMS). Then alert rules:

| Alert | Where | Condition |
|---|---|---|
| App errors | Application Insights | Failed requests > 5 in 5 minutes |
| App down | Application Insights → Availability | Standard test on `https://app.stratumpr.com` every 5 min from 3 locations |
| Restarts | Container app | Restart count > 3 in 15 minutes |
| Database CPU | PostgreSQL | CPU > 80% for 15 minutes |
| Database storage | PostgreSQL | Storage used > 80% |
| Malware found | Defender for Cloud | Email notifications for High severity alerts (Defender → Environment settings → Email notifications) |
| Budget | Cost Management | Already done in step 2 |

---

## 15. Later (after the core MVP)

| Service | For | Notes |
|---|---|---|
| **Azure AI Document Intelligence** | Reading dates, issuer and scope from certificates | S0 tier; pay per page |
| **Azure OpenAI** (Azure AI Foundry) | Embeddings (pgvector search) and the assistant | Use models covered by the startup credits; check East US 2 availability |
| **Container Apps Jobs** | Daily expiry checks, reminders to suppliers, data exports | Scheduled jobs in the same environment; nothing always-on |
| **Private networking ("campus")** | VNet, private endpoints for Postgres, Storage, Key Vault | Replaces "allow Azure services"; needs a workload-profiles environment |
| **Azure Communication Services** | Email instead of Resend | Only if we move email into Azure |

---

## 16. Rough monthly cost (pay-as-you-go list prices, before credits)

Estimates only; check the [Azure pricing calculator](https://azure.microsoft.com/pricing/calculator/)
for East US 2 before relying on them.

| Service | Dev | Prod (pilot) |
|---|---|---|
| Container Apps | ~$0–5 (scales to zero, free grant) | ~$25–45 (1 replica always on, 0.5 vCPU / 1 GiB) |
| PostgreSQL Flexible | ~$15–20 (B1ms + 32 GiB) | ~$30–40 (B2s + 32 GiB + longer backups) |
| Container Registry (Basic, shared) | ~$5 | (shared) |
| Storage (Blob) | < $1 | ~$1–5 |
| Defender for Storage | ~$10 per account + scanning per GB | ~$10 + scanning per GB |
| Log Analytics / App Insights | ~$0–5 (first GBs free) | ~$5–15 |
| Key Vault | < $1 | < $1 |
| **Total** | **~$35–50** | **~$75–120** |

---

## 17. Checklist

- [ ] Subscription in the `stratumpr.com` tenant; credits and expiry checked
- [ ] Providers registered; region `eastus2` chosen; names and suffix decided
- [ ] Resource groups (`dev`, `prod`, `shared`) with tags
- [ ] Budget with 50/80/100% alerts
- [ ] Log Analytics (+ daily cap) and Application Insights, per environment
- [ ] Managed identity per environment
- [ ] Container Registry (shared), identity has AcrPull
- [ ] Key Vault per environment (RBAC, purge protection), identity has Secrets User
- [ ] PostgreSQL per environment: TLS on, backups set, extensions allowed, `stratum` database,
      `stratum_app` role, `database-url` in Key Vault
- [ ] Storage per environment: no public or key access, versioning and soft delete, `documents`
      container, identity has Blob Data Contributor
- [ ] Defender for Storage with malware scanning and a monthly cap; EICAR test passed
- [ ] Container Apps environment and app per environment; secrets as Key Vault references;
      prod min replicas 1
- [ ] Custom domains with managed certificates
- [ ] GitHub OIDC app registration, federated credentials for `dev` and `prod`, GitHub
      environments and variables
- [ ] Action group and alerts
- [ ] (When sign-in is built) Microsoft app registration, secret in Key Vault, publisher verification

**Send back (these are IDs, not secrets):** subscription ID, tenant ID, the 4-character suffix,
the registry name, and the GitHub deploy app's client ID. With those, the Dockerfile, the
`/api/health` endpoint, the deploy workflow and the database migrations can be wired up.
