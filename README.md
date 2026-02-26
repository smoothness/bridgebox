# 📦 Bridgebox

A multi-tenant SaaS Social CRM built on AWS Serverless. Bridgebox unifies inbound messages from **WhatsApp Business** and **Instagram** into a single platform, enabling businesses to manage customer conversations at scale.

## 🗺️ Overview

- 🏢 **Multi-tenancy:** Pooled isolation using a Single Table Design in DynamoDB (`tenantId` as Partition Key).
- ☁️ **Infrastructure as Code:** Deployed with [SST v2](https://v2.sst.dev) on AWS (`us-east-2`).
- 📦 **Monorepo:** Managed with `pnpm` workspaces.

## 🏗️ Architecture

```
Meta (WhatsApp / Instagram)
        │
        ▼
  API Gateway (REST)
        │
  WebhookReceiver (Lambda)  ──validates Meta signature
        │
      SQS (IncomingMessagesQueue)
        │
  MessageProcessor (Lambda) ──saves to DynamoDB
        │
  DynamoDB (SocialCRMTable)  ──Single Table Design
```

### ☁️ AWS Resources

| Resource | Purpose |
|---|---|
| API Gateway | Single regional REST API |
| Lambda – WebhookReceiver | Validates Meta `x-hub-signature-256` and enqueues messages |
| Lambda – MessageProcessor | Consumes SQS, resolves tenant/customer, persists messages |
| Lambda – AuthService | Manages API keys and tenant JWTs |
| SQS + DLQ | Async decoupling and error handling for failed messages |
| DynamoDB | Single-table store for tenants, customers, and messages |

## 📁 Project Structure

```
bridgebox/
├── packages/
│   ├── functions/        # Lambda handlers
│   │   └── src/
│   │       ├── webhooks/ # Meta webhook receiver
│   │       └── events/   # SQS event processors
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
| POST | `/send-message` | Send a message via WhatsApp or Instagram |

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
| Tenant | `TENANT#<id>` | `METADATA` | `plan`, `name`, `metaAccessToken` |
| Customer | `TENANT#<id>` | `CUSTOMER#<phone\|ig_handle>` | `name`, `lastChannel` |
| Message | `TENANT#<id>#CUST#<id>` | `MSG#<timestamp>` | `body`, `channel` (WA/IG), `status` |

## 🛠️ Tech Stack

- **Runtime:** Node.js 20 / TypeScript
- **IaC:** SST v2 + AWS CDK
- **Database:** DynamoDB (Single Table Design)
- **Validation:** Zod
- **Linting/Formatting:** Biome
- **API Testing:** Bruno
- **API Spec:** OpenAPI 3
