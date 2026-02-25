# Multi-Tenant Social CRM: AWS Serverless SaaS Blueprint

## 1. Project Overview
- Goal: Build a multi-tenant SaaS CRM that unifies messages from WhatsApp Business and Instagram.
- Stack: AWS Serverless (Lambda, API Gateway, SQS, DynamoDB), SST (Serverless Stack) or AWS SAM for IaC.
- Multi-Tenancy: Pooled isolation (one table, tenantId as Partition Key).

## 2. Infrastructure (IaC) Requirements
Use SST (sst.dev) or AWS SAM.
- API Gateway: A single regional REST API.
- SQS Queue: IncomingMessagesQueue to buffer webhooks from Meta.
- Lambda Functions:
	1. WebhookReceiver: Validates Meta signature and pushes to SQS.
	2. MessageProcessor: Processes SQS messages and saves to DynamoDB.
	3. AuthService: Manages API keys and Tenant JWTs.
- DynamoDB: A single table SocialCRMTable with Single Table Design.

## 3. Database Schema (Single Table Design)
Entity	PK (Partition Key)	SK (Sort Key)	Attributes
Tenant	TENANT#<id>	METADATA	plan, name, metaAccessToken
Customer	TENANT#<id>	CUSTOMER#<phone/ig_handle>	name, lastChannel
Message	TENANT#<id>#CUST#<id>	MSG#<timestamp>	body, channel (WA/IG), status

## 4. Implementation Step-by-Step

### Phase 1: The Ingestion Pipe
1. Create Webhook Entry Point: Set up a /webhooks/meta endpoint.
2. Verify Challenge: Implement the GET logic for Meta’s webhook verification.
3. Validate Signatures: Implement POST logic using x-hub-signature-256 to ensure security.
4. Async Decoupling: Immediately push the message body to SQS.

### Phase 2: Processing & Multi-Tenancy
1. SQS Worker: Create a Lambda that consumes SQS.
2. Tenant Context: Extract the WABA_ID (WhatsApp Business Account ID) from the message and look up the corresponding tenantId in the DB.
3. Identity Mapping: Check if the sender exists. If not, create a new Customer record.
4. Persistence: Store the message.

### Phase 3: Outbound Messaging
1. API Endpoint: Create /send-message.
2. Integration Logic: Use the tenantId to fetch the correct Meta Access Token.
3. Meta API Call: Execute the POST request to graph.facebook.com/v20.0/<ID>/messages.

## 5. Instructions for Cursor/Agents
- "When building this, please follow these rules:"
- DRY Code: Use a shared layers or common folder for DynamoDB helpers and Meta API wrappers.
- Zod Validation: All incoming payloads from Meta and the Frontend must be validated with Zod.
- Error Handling: Implement a Dead Letter Queue (DLQ) for the SQS queue.
- Statelessness: Ensure no Lambda stores state; use DynamoDB for all persistence.




