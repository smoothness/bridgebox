import type { SSTConfig } from 'sst'
import type { StackContext } from 'sst/constructs'
import { Api, Cognito, NextjsSite, Queue, Script, Table } from 'sst/constructs'
import { SecretValue } from 'aws-cdk-lib'
import { CfnPermission } from 'aws-cdk-lib/aws-lambda'
import { PolicyStatement } from 'aws-cdk-lib/aws-iam'
import { Vpc, SubnetType } from 'aws-cdk-lib/aws-ec2'
import {
	DatabaseCluster,
	DatabaseClusterEngine,
	AuroraPostgresEngineVersion,
	ClusterInstance,
} from 'aws-cdk-lib/aws-rds'
import {
	OAuthScope,
	VerificationEmailStyle,
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
			gsi1pk: 'string',
			gsi1sk: 'string',
		},
		primaryIndex: { partitionKey: 'pk', sortKey: 'sk' },
		globalIndexes: {
			// Resolves which Tenant owns the account that received an inbound message
			ByPlatformAccountId: { partitionKey: 'platformAccountId' },
			ByUserEmail: { partitionKey: 'gsi1pk', sortKey: 'gsi1sk' },
		},
	})

	// ─── Aurora Serverless v2 — CRM relational store ────────────────────────────
	// Isolated subnets, no NAT gateway (zero VPC cost). Data API enables HTTP-based
	// SQL from Lambda without placing functions inside the VPC.
	const crmVpc = new Vpc(stack, 'CrmVpc', {
		availabilityZones: [`${stack.region}a`, `${stack.region}b`],
		natGateways: 0,
		subnetConfiguration: [
			{
				name: 'isolated',
				subnetType: SubnetType.PRIVATE_ISOLATED,
				cidrMask: 24,
			},
		],
	})

	const crmDatabase = new DatabaseCluster(stack, 'CrmDatabase', {
		engine: DatabaseClusterEngine.auroraPostgres({
			version: AuroraPostgresEngineVersion.VER_16_6,
		}),
		serverlessV2MinCapacity: 0.5,
		serverlessV2MaxCapacity: 8,
		writer: ClusterInstance.serverlessV2('writer'),
		vpc: crmVpc,
		vpcSubnets: { subnetType: SubnetType.PRIVATE_ISOLATED },
		enableDataApi: true,
		defaultDatabaseName: 'crmdb',
		storageEncrypted: true,
	})

	const crmDbClusterArn = crmDatabase.clusterArn
	const crmDbSecretArn = crmDatabase.secret!.secretArn
	const crmDbName = 'crmdb'

	// ─── Auth (Cognito) — defined before Api so userPoolId/clientId are available ─
	const localPortalBaseUrl = 'http://localhost:3000'
	const localBackofficeBaseUrl = 'http://localhost:3001'
	const portalBaseUrl = process.env.PORTAL_BASE_URL ?? localPortalBaseUrl
	const backofficeBaseUrl =
		process.env.BACKOFFICE_BASE_URL ?? localBackofficeBaseUrl
	const callbackUrls = Array.from(
		new Set([
			`${localPortalBaseUrl}/api/auth/callback`,
			`${localBackofficeBaseUrl}/api/auth/callback`,
			`${portalBaseUrl}/api/auth/callback`,
			`${backofficeBaseUrl}/api/auth/callback`,
		]),
	)
	const logoutUrls = Array.from(
		new Set([
			`${localPortalBaseUrl}/`,
			`${localBackofficeBaseUrl}/`,
			`${portalBaseUrl}/`,
			`${backofficeBaseUrl}/`,
		]),
	)
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
				selfSignUpEnabled: true,
				autoVerify: { email: true },
				userVerification: {
					emailSubject: 'Bridgebox verification code',
					emailBody:
						'Your Bridgebox verification code is {####}. Enter this code to confirm your account.',
					emailStyle: VerificationEmailStyle.CODE,
				},
			},
			userPoolClient: {
				authFlows: {
					userPassword: true,
					userSrp: true,
				},
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

	// ─── Processes messages from the ingestion queue ──────────────────────────
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
					// Cognito — used by tenant API handlers for JWT verification
					COGNITO_USER_POOL_ID: auth.userPoolId,
					COGNITO_APP_CLIENT_ID: auth.userPoolClientId,
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
					// Aurora Serverless v2 — CRM relational store (accessed via Data API)
					CRM_DB_CLUSTER_ARN: crmDbClusterArn,
					CRM_DB_SECRET_ARN: crmDbSecretArn,
					CRM_DB_NAME: crmDbName,
				},
			},
		},
		routes: {
			'GET /': 'packages/functions/src/lambda.handler',
			'GET /webhooks/meta': 'packages/functions/src/webhooks/meta.handler',
			'POST /webhooks/meta': 'packages/functions/src/webhooks/meta.handler',
			'POST /send-message': 'packages/functions/src/messages/send.handler',
			// Tenant CRUD — platform_admin only
			'POST /tenants': 'packages/functions/src/tenants/create.handler',
			'GET /tenants': 'packages/functions/src/tenants/list.handler',
			'PATCH /tenants/{tenantId}': 'packages/functions/src/tenants/update.handler',
		},
	})

	// Grant only the webhook receiver permission to enqueue messages
	api.attachPermissionsToRoute('POST /webhooks/meta', [incomingMessagesQueue])
	// Tenant auth fallback reads backoffice membership from DynamoDB
	api.attachPermissionsToRoute('POST /tenants', [table])
	api.attachPermissionsToRoute('GET /tenants', [table])
	api.attachPermissionsToRoute('PATCH /tenants/{tenantId}', [table])

	// Grant all Api functions access to Aurora Data API and the DB secret
	api.attachPermissions([
		new PolicyStatement({
			actions: ['rds-data:ExecuteStatement', 'rds-data:BatchExecuteStatement'],
			resources: [crmDbClusterArn],
		}),
		new PolicyStatement({
			actions: ['secretsmanager:GetSecretValue'],
			resources: [crmDbSecretArn],
		}),
	])

	// ─── Run DB migrations on every deploy (idempotent) ──────────────────────
	const migrationScript = new Script(stack, 'DbMigrations', {
		defaults: {
			function: {
				environment: {
					CRM_DB_CLUSTER_ARN: crmDbClusterArn,
					CRM_DB_SECRET_ARN: crmDbSecretArn,
					CRM_DB_NAME: crmDbName,
				},
			},
		},
		onCreate: 'packages/functions/src/migrate.handler',
		onUpdate: 'packages/functions/src/migrate.handler',
	})
	migrationScript.attachPermissions([
		new PolicyStatement({
			actions: ['rds-data:ExecuteStatement', 'rds-data:BatchExecuteStatement'],
			resources: [crmDbClusterArn],
		}),
		new PolicyStatement({
			actions: ['secretsmanager:GetSecretValue'],
			resources: [crmDbSecretArn],
		}),
	])

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
			SOCIAL_CRM_TABLE_NAME: table.tableName,
			PORTAL_BASE_URL: portalBaseUrl,
			BACKOFFICE_BASE_URL: backofficeBaseUrl,
			API_BASE_URL: api.url,
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
			SOCIAL_CRM_TABLE_NAME: table.tableName,
			PORTAL_BASE_URL: portalBaseUrl,
			BACKOFFICE_BASE_URL: backofficeBaseUrl,
			API_BASE_URL: api.url,
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
		CrmDbClusterArn: crmDbClusterArn,
		CrmDbName: crmDbName,
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
