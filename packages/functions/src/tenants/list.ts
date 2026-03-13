import { listTenantProfiles } from '@bridgebox/core/postgres'
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda'
import { errorResponse, jsonResponse, requirePlatformAdmin } from './_auth'

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
	try {
		await requirePlatformAdmin(event)
		const profiles = await listTenantProfiles()
		return jsonResponse(200, profiles)
	} catch (err) {
		return errorResponse(err)
	}
}
