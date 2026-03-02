# Bridgebox Project Steps (Aligned with Current Implementation)

## 1. Project Overview
- Goal: build a multi-tenant social CRM that ingests, stores, and sends messages across Meta channels.
- Current channels: Instagram + Facebook inbound/outbound, WhatsApp outbound support in send flow.
- Stack: SST v2, API Gateway, Lambda, SQS, DynamoDB single-table, Zod, OpenAPI, Bruno, Postman.
- Multi-tenancy model: Tenant owns multiple Accounts; routing is account-first by `platformAccountId`.

## 2. Current Infrastructure
- API routes:
	1. `GET /` health check
	2. `GET /webhooks/meta` verification challenge
	3. `POST /webhooks/meta` signed webhook ingestion
	4. `POST /send-message` outbound send with optional `x-api-key` auth
- Queues:
	1. `IncomingMessagesQueue` for async webhook processing
	2. `DeadLetterQueue` for failed retries
- Functions:
	1. Webhook receiver Lambda (signature verification + enqueue)
	2. Message processor Lambda (SQS consumer + Dynamo writes)
	3. Send-message Lambda (account resolution + Meta outbound call)
- Database:
	1. `SocialCRMTable` single-table
	2. GSI `ByPlatformAccountId` for routing/account lookup

## 3. Single-Table Data Model (Current)
- Tenant
	1. `pk = TENANT#<tenantId>`
	2. `sk = METADATA`
	3. Attributes: `name`, `plan`, `channel`, `platformAccountId`, `accessToken`
- Account
	1. `pk = TENANT#<tenantId>`
	2. `sk = ACCOUNT#<accountId>`
	3. Attributes: `platformAccountId`, `channel`, `displayName`, `accessToken`, `clientLabel`
- Contact
	1. `pk = TENANT#<tenantId>#ACCOUNT#<accountId>`
	2. `sk = CONTACT#<senderId>`
	3. Attributes: `lastChannel`, optional `name`
- Message (inbound persisted)
	1. `pk = TENANT#<tenantId>#ACCOUNT#<accountId>#CONTACT#<senderId>`
	2. `sk = MSG#<isoTimestamp>#<externalMessageId>`
	3. Attributes: `body`, `channel`, `status`, `externalMessageId`

## 4. Delivery Phases (Status)
### Phase 1: Ingestion Pipe (Completed)
1. Implement webhook endpoint.
2. Implement challenge verification.
3. Validate Meta signature (`x-hub-signature-256`).
4. Enqueue payloads to SQS.

### Phase 2: Processing & Persistence (Completed)
1. Implement SQS worker.
2. Parse webhook payload with shared schema.
3. Resolve routing context from platform account ID.
4. Upsert Contact and persist Message records.
5. Add idempotency handling and partial batch failure retries.

### Phase 3: Outbound Messaging (Completed)
1. Implement `POST /send-message`.
2. Resolve account and token.
3. Send message to Meta Graph API.
4. Add optional endpoint API key (`SEND_MESSAGE_API_KEY` / `x-api-key`).

### Phase 3.5: Agency / Multi-Account Evolution (Completed)
1. Introduce Account entity under Tenant.
2. Move processing/routing to account-first model.
3. Remove legacy tenant fallback paths after stabilization.
4. Align seed scripts, E2E scripts, OpenAPI/README, Bruno/Postman.

### Phase 4: Outbound Persistence & Conversation Read APIs (Planned)
1. Persist outbound messages in DynamoDB with direction/status lifecycle.
2. Add conversation list/timeline read endpoints with pagination.
3. Extend OpenAPI and regenerate Bruno/Postman artifacts.
4. Add E2E for outbound persistence + conversation retrieval + isolation checks.

## 5. Working Rules for Agents
- Keep implementation account-first (no reintroduction of tenant-only fallback).
- Use strict DynamoDB key-condition queries for reads; avoid scans.
- Validate external and client payloads with Zod.
- Keep webhook processing idempotent and retry-safe.
- Keep changes file-by-file with explicit review/approval gates.




