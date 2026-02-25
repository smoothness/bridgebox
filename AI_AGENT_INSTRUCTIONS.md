# Instructions for AI Agents

This document provides instructions for any AI agent working on this project. Please follow these guidelines to ensure consistency and quality.

## 1. Project Overview
- **Goal:** Build a multi-tenant SaaS CRM that unifies messages from WhatsApp Business and Instagram.
- **Stack:** AWS Serverless (Lambda, API Gateway, SQS, DynamoDB), with SST (Serverless Stack) for Infrastructure as Code (IaC).
- **Multi-Tenancy:** Use a pooled isolation model with a single DynamoDB table. The `tenantId` will be the Partition Key.

## 2. Infrastructure (IaC) Requirements
- Use SST (sst.dev) for defining and deploying the infrastructure.
- **API Gateway:** A single regional REST API.
- **SQS Queue:** An `IncomingMessagesQueue` to buffer webhooks from Meta.
- **Lambda Functions:**
    1.  `WebhookReceiver`: Validates Meta signature and pushes to SQS.
    2.  `MessageProcessor`: Processes SQS messages and saves to DynamoDB.
    3.  `AuthService`: Manages API keys and Tenant JWTs.
- **DynamoDB:** A single table named `SocialCRMTable` using Single Table Design.

## 3. Database Schema (Single Table Design)
| Entity   | PK (Partition Key)        | SK (Sort Key)                   | Attributes                    |
|----------|---------------------------|---------------------------------|-------------------------------|
| Tenant   | `TENANT#<id>`             | `METADATA`                      | `plan`, `name`, `metaAccessToken` |
| Customer | `TENANT#<id>`             | `CUSTOMER#<phone/ig_handle>`    | `name`, `lastChannel`         |
| Message  | `TENANT#<id>#CUST#<id>`    | `MSG#<timestamp>`               | `body`, `channel`, `status`     |

## 4. Implementation Plan

### Phase 1: The Ingestion Pipe
1.  **Webhook Entry Point:** Set up a `/webhooks/meta` endpoint.
2.  **Challenge Verification:** Implement the `GET` logic for Meta’s webhook verification.
3.  **Signature Validation:** Implement `POST` logic using `x-hub-signature-256` for security.
4.  **Async Decoupling:** Immediately push the message body to the SQS queue.

### Phase 2: Processing & Multi-Tenancy
1.  **SQS Worker:** Create a Lambda that consumes messages from the SQS queue.
2.  **Tenant Context:** Extract the `WABA_ID` (WhatsApp Business Account ID) from the message and look up the corresponding `tenantId` in the database.
3.  **Identity Mapping:** Check if the sender exists. If not, create a new `Customer` record.
4.  **Persistence:** Store the message in DynamoDB.

### Phase 3: Outbound Messaging
1.  **API Endpoint:** Create a `/send-message` endpoint.
2.  **Integration Logic:** Use the `tenantId` to fetch the correct Meta Access Token.
3.  **Meta API Call:** Execute the `POST` request to `graph.facebook.com/v20.0/<ID>/messages`.

## 5. Coding Rules and Best Practices

- **DRY Code:** Use shared layers or a `common` folder for DynamoDB helpers and Meta API wrappers.
- **Validation:** All incoming payloads from Meta and any frontend must be validated with Zod.
- **Error Handling:** Implement a Dead Letter Queue (DLQ) for the SQS queue.
- **Statelessness:** Ensure all Lambda functions are stateless. Use DynamoDB for all persistence.
- **Package Manager:** Always use pnpm for package management.

## 6. Agent Collaboration Rules

- **Work file-by-file only:** Never modify more than one file per step.
- **Explain every change:** After each file modification, explain every change in detail.
- **Wait for approval:** Wait for approval before continuing to the next step.
