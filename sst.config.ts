import type { SSTConfig } from 'sst'
import type { StackContext } from 'sst/constructs'
import { Api, Queue } from 'sst/constructs'

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

	const api = new Api(stack, 'Api', {
		defaults: {
			function: {
				environment: {
					// Token configured in Meta's developer portal for webhook verification
					WEBHOOK_VERIFY_TOKEN: process.env.WEBHOOK_VERIFY_TOKEN ?? '',
					// App Secret from Meta's developer portal — used to validate x-hub-signature-256
					META_APP_SECRET: process.env.META_APP_SECRET ?? '',
					// SQS queue URL for async message processing
					INCOMING_MESSAGES_QUEUE_URL: incomingMessagesQueue.queueUrl,
				},
			},
		},
		routes: {
			'GET /': 'packages/functions/src/lambda.handler',
			'GET /webhooks/meta': 'packages/functions/src/webhooks/meta.handler',
			'POST /webhooks/meta': 'packages/functions/src/webhooks/meta.handler',
		},
	})

	// Grant only the webhook receiver permission to enqueue messages
	api.attachPermissionsToRoute('POST /webhooks/meta', [incomingMessagesQueue])

	stack.addOutputs({
		ApiEndpoint: api.url,
		IncomingMessagesQueueUrl: incomingMessagesQueue.queueUrl,
		DeadLetterQueueUrl: dlq.queueUrl,
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
