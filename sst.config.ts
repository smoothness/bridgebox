import type { SSTConfig } from 'sst'
import type { StackContext } from 'sst/constructs'
import { Api, Cognito, NextjsSite, Queue, Table } from 'sst/constructs'
import { SecretValue } from 'aws-cdk-lib'
import { CfnPermission } from 'aws-cdk-lib/aws-lambda'
import {
	OAuthScope,
	ProviderAttribute,
	UserPoolClientIdentityProvider,
	UserPoolDomain,
	UserPoolIdentityProviderFacebook,
	UserPoolIdentityProviderGoogle,
} from 'aws-cdk-lib/aws-cognito'

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
	const portalBaseUrl = process.env.PORTAL_BASE_URL ?? 'http://localhost:3000'
	const backofficeBaseUrl =
		process.env.BACKOFFICE_BASE_URL ?? 'http://localhost:3001'
	const callbackUrls = [
		`${portalBaseUrl}/auth/callback`,
		`${backofficeBaseUrl}/auth/callback`,
	]
	const logoutUrls = [`${portalBaseUrl}/`, `${backofficeBaseUrl}/`]
	const hasGoogleIdp = Boolean(
		process.env.COGNITO_GOOGLE_CLIENT_ID && process.env.COGNITO_GOOGLE_CLIENT_SECRET
	)
	const hasFacebookIdp = Boolean(
		process.env.COGNITO_FACEBOOK_APP_ID && process.env.COGNITO_FACEBOOK_APP_SECRET
	)
	const supportedIdentityProviders = [
		UserPoolClientIdentityProvider.COGNITO,
		...(hasGoogleIdp ? [UserPoolClientIdentityProvider.GOOGLE] : []),
		...(hasFacebookIdp ? [UserPoolClientIdentityProvider.FACEBOOK] : []),
	]

	const auth = new Cognito(stack, 'Auth', {
		login: ['email'],
		cdk: {
			userPool: {
				selfSignUpEnabled: false,
			},
			userPoolClient: {
				oAuth: {
					callbackUrls,
					logoutUrls,
					scopes: [OAuthScope.OPENID, OAuthScope.EMAIL, OAuthScope.PROFILE],
				},
				supportedIdentityProviders,
			},
		},
	})

	const authDomain = new UserPoolDomain(stack, 'AuthDomain', {
		userPool: auth.cdk.userPool,
		cognitoDomain: {
			domainPrefix: `${stack.stage}-bridgebox-auth`,
		},
	})
	const cognitoDomainHost = `${authDomain.domainName}.auth.${stack.region}.amazoncognito.com`


	const googleClientId = process.env.COGNITO_GOOGLE_CLIENT_ID
	const googleClientSecret = process.env.COGNITO_GOOGLE_CLIENT_SECRET
	if (googleClientId && googleClientSecret) {
		const googleProvider = new UserPoolIdentityProviderGoogle(
			stack,
			'GoogleProvider',
			{
				userPool: auth.cdk.userPool,
				clientId: googleClientId,
				clientSecretValue: SecretValue.unsafePlainText(googleClientSecret),
				scopes: ['email', 'openid', 'profile'],
				attributeMapping: {
					email: ProviderAttribute.other('email'),
					givenName: ProviderAttribute.other('given_name'),
					familyName: ProviderAttribute.other('family_name'),
				},
			}
		)
		auth.cdk.userPoolClient.node.addDependency(googleProvider)
	}

	const facebookAppId = process.env.COGNITO_FACEBOOK_APP_ID
	const facebookAppSecret = process.env.COGNITO_FACEBOOK_APP_SECRET
	if (facebookAppId && facebookAppSecret) {
		const facebookProvider = new UserPoolIdentityProviderFacebook(
			stack,
			'FacebookProvider',
			{
				userPool: auth.cdk.userPool,
				clientId: facebookAppId,
				clientSecret: facebookAppSecret,
				scopes: ['email', 'public_profile'],
				attributeMapping: {
					email: ProviderAttribute.other('email'),
					givenName: ProviderAttribute.other('first_name'),
					familyName: ProviderAttribute.other('last_name'),
				},
			}
		)
		auth.cdk.userPoolClient.node.addDependency(facebookProvider)
	}

	const portalSite = new NextjsSite(stack, 'PortalSite', {
		path: 'packages/portal',
		regional: {
			enableServerUrlIamAuth: false,
		},
		environment: {
			NODE_ENV: 'production',
			COGNITO_USER_POOL_ID: auth.userPoolId,
			COGNITO_APP_CLIENT_ID: auth.userPoolClientId,
			COGNITO_DOMAIN: cognitoDomainHost,
			PORTAL_BASE_URL: portalBaseUrl,
			BACKOFFICE_BASE_URL: backofficeBaseUrl,
		},
	})
	new CfnPermission(stack, 'PortalFunctionUrlInvokePermission', {
		action: 'lambda:InvokeFunction',
		functionName: portalSite.cdk?.function?.functionArn ?? '',
		principal: '*',
		invokedViaFunctionUrl: true,
	} as any)

	const backofficeSite = new NextjsSite(stack, 'BackofficeSite', {
		path: 'packages/backoffice',
		regional: {
			enableServerUrlIamAuth: false,
		},
		environment: {
			NODE_ENV: 'production',
			COGNITO_USER_POOL_ID: auth.userPoolId,
			COGNITO_APP_CLIENT_ID: auth.userPoolClientId,
			COGNITO_DOMAIN: cognitoDomainHost,
			PORTAL_BASE_URL: portalBaseUrl,
			BACKOFFICE_BASE_URL: backofficeBaseUrl,
		},
	})
	new CfnPermission(stack, 'BackofficeFunctionUrlInvokePermission', {
		action: 'lambda:InvokeFunction',
		functionName: backofficeSite.cdk?.function?.functionArn ?? '',
		principal: '*',
		invokedViaFunctionUrl: true,
	} as any)

	stack.addOutputs({
		ApiEndpoint: api.url,
		IncomingMessagesQueueUrl: incomingMessagesQueue.queueUrl,
		DeadLetterQueueUrl: dlq.queueUrl,
		SocialCRMTableName: table.tableName,
		CognitoUserPoolId: auth.userPoolId,
		CognitoAppClientId: auth.userPoolClientId,
		CognitoDomain: cognitoDomainHost,
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
