import { updateTenantProfile } from '@bridgebox/core/postgres'
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda'
import { z } from 'zod'
import { errorResponse, jsonResponse, requirePlatformAdmin } from './_auth'

const schema = z.object({
	businessName: z.string().nullable().optional(),
	contactName: z.string().min(1).optional(),
	contactEmail: z.string().email().optional(),
	country: z.string().min(1).optional(),
	plan: z.enum(['solo', 'agency_basic', 'agency_pro']).optional(),
	status: z.enum(['active', 'suspended']).optional(),
})

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
	try {
		await requirePlatformAdmin(event)

		const tenantId = event.pathParameters?.tenantId
		if (!tenantId) {
			return jsonResponse(400, { error: 'Missing tenantId path parameter' })
		}

		const parsed = schema.safeParse(JSON.parse(event.body ?? '{}'))
		if (!parsed.success) {
			return jsonResponse(400, {
				error: 'Invalid input',
				details: parsed.error.flatten(),
			})
		}

		const profile = await updateTenantProfile(tenantId, parsed.data)
		return jsonResponse(200, profile)
	} catch (err) {
		return errorResponse(err)
	}
}
