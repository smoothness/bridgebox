import type { SSTConfig } from 'sst'
import type { StackContext } from 'sst/constructs'
import { Api, NextjsSite, Queue, Table } from 'sst/constructs'

function ApiStack({ stack }: StackContext) {
	// Dead Letter Queue — receives messages that fail processing 3 times
	const dlq = new Queue(stack, 'DeadLetterQueue')

	// Main ingestion queue — buffers validated webhook payloads for async processing
	const incomingMessagesQueue = new Queue(stack, 'IncomingMessagesQueue', {
		cdk: {
			queue: {
				deadLetterQueue: {
					queue: dlq.cdk.queue,
					maxReceiveCount: 3,
				},
			},
		},
	})

	// Single-table DynamoDB for all CRM data (Tenants, Contacts, Messages)
	const table = new Table(stack, 'SocialCRMTable', {
		fields: {
			pk: 'string',
			sk: 'string',
			// GSI key — platform-specific account ID (page ID, WABA_ID, TikTok user ID, etc.)
			platformAccountId: 'string',
		},
		primaryIndex: { partitionKey: 'pk', sortKey: 'sk' },
		globalIndexes: {
			// Resolves which Tenant owns the account that received an inbound message
			ByPlatformAccountId: { partitionKey: 'platformAccountId' },
		},
	})

	// Processes messages from the ingestion queue, resolves tenant, upserts contact, saves message
	incomingMessagesQueue.addConsumer(stack, {
		function: {
			handler: 'packages/functions/src/processors/message.handler',
			environment: {
				SOCIAL_CRM_TABLE_NAME: table.tableName,
			},
			permissions: [table],
		},
		cdk: {
			eventSource: {
				// Only failed records are retried — healthy records are not reprocessed
				reportBatchItemFailures: true,
				batchSize: 10,
			},
		},
	})

	const api = new Api(stack, 'Api', {
		defaults: {
			function: {
				environment: {
					// Token configured in Meta's developer portal for webhook verification
					WEBHOOK_VERIFY_TOKEN: process.env.WEBHOOK_VERIFY_TOKEN ?? '',
					// App Secret from Meta's developer portal — used to validate x-hub-signature-256
					META_APP_SECRET: process.env.META_APP_SECRET ?? '',
					// Optional app-level auth for outbound /send-message endpoint
					SEND_MESSAGE_API_KEY: process.env.SEND_MESSAGE_API_KEY ?? '',
					// SQS queue URL for async message processing
					INCOMING_MESSAGES_QUEUE_URL: incomingMessagesQueue.queueUrl,
					// DynamoDB table for resolving account/tenant context in send-message
					SOCIAL_CRM_TABLE_NAME: table.tableName,
				},
			},
		},
		routes: {
			'GET /': 'packages/functions/src/lambda.handler',
			'GET /webhooks/meta': 'packages/functions/src/webhooks/meta.handler',
			'POST /webhooks/meta': 'packages/functions/src/webhooks/meta.handler',
			'POST /send-message': 'packages/functions/src/messages/send.handler',
		},
	})

	// Grant only the webhook receiver permission to enqueue messages
	api.attachPermissionsToRoute('POST /webhooks/meta', [incomingMessagesQueue])

	const portalSite = new NextjsSite(stack, 'PortalSite', {
		path: 'packages/portal',
	})

	const backofficeSite = new NextjsSite(stack, 'BackofficeSite', {
		path: 'packages/backoffice',
	})

	stack.addOutputs({
		ApiEndpoint: api.url,
		IncomingMessagesQueueUrl: incomingMessagesQueue.queueUrl,
		DeadLetterQueueUrl: dlq.queueUrl,
		SocialCRMTableName: table.tableName,
		PortalUrl: portalSite.url || '',
		BackofficeUrl: backofficeSite.url || '',
	})
}

export default {
	config() {
		return {
			name: 'bridgebox',
			region: 'us-east-2',
			profile: 'bridgebox-dev',
			bootstrap: {
				stackName: 'bridgebox-SSTBootstrap',
			},
			cdk: {
				toolkitStackName: 'bridgebox-CDKToolkit',
			},
		}
	},
	stacks(app) {
		app.stack(ApiStack)
	},
} satisfies SSTConfig
