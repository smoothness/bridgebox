import type { SSTConfig } from 'sst'
import type { StackContext } from 'sst/constructs'
import { Api } from 'sst/constructs'

function ApiStack({ stack }: StackContext) {
	const api = new Api(stack, 'Api', {
		defaults: {
			function: {
				environment: {
					// Token configured in Meta's developer portal for webhook verification
					WEBHOOK_VERIFY_TOKEN: process.env.WEBHOOK_VERIFY_TOKEN ?? '',
				},
			},
		},
		routes: {
			'GET /': 'packages/functions/src/lambda.handler',
			'GET /webhooks/meta': 'packages/functions/src/webhooks/meta.handler',
			'POST /webhooks/meta': 'packages/functions/src/webhooks/meta.handler',
		},
	})

	stack.addOutputs({
		ApiEndpoint: api.url,
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
