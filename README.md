# 📦 Bridgebox

A multi-tenant SaaS Social CRM built on AWS Serverless. Bridgebox currently processes inbound messages from **Instagram** and **Facebook** webhooks, with a model designed to extend to additional channels.

## 🗺️ Overview

- 🏢 **Multi-tenancy:** Pooled isolation using a single DynamoDB table with hierarchical key patterns.
- ☁️ **Infrastructure as Code:** Deployed with [SST v2](https://v2.sst.dev) on AWS (`us-east-2`).
- 📦 **Monorepo:** Managed with `pnpm` workspaces.

## 🏗️ Architecture

```
Meta (Instagram / Facebook)
        │
        ▼
  API Gateway (REST)
        │
  WebhookReceiver (Lambda)  ──validates Meta signature
        │
      SQS (IncomingMessagesQueue)
        │
  MessageProcessor (Lambda) ──resolves tenant/account + saves to DynamoDB
        │
  DynamoDB (SocialCRMTable)  ──Single Table Design
```

### ☁️ AWS Resources

| Resource | Purpose |
|---|---|
| API Gateway | Single regional REST API |
| Lambda – WebhookReceiver | Validates Meta `x-hub-signature-256` and enqueues messages |
| Lambda – MessageProcessor | Consumes SQS, resolves tenant/account routing context, persists contacts/messages |
| SQS + DLQ | Async decoupling and error handling for failed messages |
| DynamoDB | Single-table store for tenants, accounts, contacts, and messages |

## 📁 Project Structure

```
bridgebox/
├── packages/
│   ├── functions/        # Lambda handlers
│   │   └── src/
│   │       ├── webhooks/ # Meta webhook receiver
│   │       └── processors/ # SQS event processors
│   └── core/             # Shared utilities (DynamoDB helpers, Meta API wrappers)
├── openapi/              # OpenAPI specification
├── bruno/                # Bruno API collection
├── docs/                 # Generated API docs
└── sst.config.ts         # SST infrastructure definition
```

## 🚀 Getting Started

### ✅ Prerequisites

- Node.js 20+
- pnpm
- AWS CLI configured with the `bridgebox-dev` profile
- SST CLI (`pnpm add -g sst`)

### 📥 Install dependencies

```bash
pnpm install
```

### 🧑‍💻 Local development

Starts SST's live Lambda development environment:

```bash
pnpm dev
```

### 🚢 Deploy

```bash
pnpm deploy
```

### 🗑️ Remove stack

```bash
pnpm remove
```

## 🔌 API

### 📡 Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/webhooks/meta` | Meta webhook verification challenge |
| POST | `/webhooks/meta` | Receive inbound messages from Meta |
| POST | `/send-message` | Send outbound text message via Instagram, Facebook, or WhatsApp |

### 📖 API Docs

Preview the API docs locally:

```bash
pnpm api:docs:preview
```

Build static API docs:

```bash
pnpm api:docs:build
```

Lint the OpenAPI spec:

```bash
pnpm api:lint
```

## 🧪 Testing

Run the full Bruno API test suite against the deployed API Gateway:

```bash
pnpm api:bruno:run
```

Run webhook end-to-end test suite and cleanup:

```bash
pnpm e2e:webhook
pnpm e2e:webhook:clean
```

Seed test data (defaults to Account mode):

```bash
pnpm db:seed
```

## 🧹 Code Quality

```bash
# Type check
pnpm typecheck

# Lint
pnpm lint

# Lint and auto-fix
pnpm lint:fix

# Format
pnpm format
```

## 🗄️ Database Schema (Single Table Design)

| Entity | PK | SK | Key Attributes |
|---|---|---|---|
| Tenant | `TENANT#<tenantId>` | `METADATA` | `plan`, `name`, `platformAccountId`, `accessToken` |
| Account | `TENANT#<tenantId>` | `ACCOUNT#<accountId>` | `platformAccountId`, `channel`, `displayName` |
| Contact | `TENANT#<tenantId>#ACCOUNT#<accountId>` | `CONTACT#<senderId>` | `name`, `lastChannel` |
| Message | `TENANT#<tenantId>#ACCOUNT#<accountId>#CONTACT#<senderId>` | `MSG#<isoTimestamp>#<externalMessageId>` | `body`, `channel`, `status`, `externalMessageId` |

Webhook routing is Account-first via `platformAccountId`, with legacy tenant fallback for development compatibility.

## 📤 Outbound Messaging

Bridgebox now supports outbound text messaging through Meta Graph API.

- Endpoint: `POST /send-message`
- Channels: `instagram`, `facebook`, `whatsapp`
- Routing: resolves `platformAccountId` with account-first lookup and development compatibility fallback.

## 🛠️ Tech Stack

- **Runtime:** Node.js 20 / TypeScript
- **IaC:** SST v2 + AWS CDK
- **Database:** DynamoDB (Single Table Design)
- **Validation:** Zod
- **Linting/Formatting:** Biome
- **API Testing:** Bruno
- **API Spec:** OpenAPI 3
