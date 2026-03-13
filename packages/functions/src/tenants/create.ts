import { createTenantProfile } from '@bridgebox/core/postgres'
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { errorResponse, jsonResponse, requirePlatformAdmin } from './_auth'

const schema = z.object({
	contactName: z.string().min(1),
	contactEmail: z.string().email(),
	country: z.string().min(1),
	plan: z.enum(['solo', 'agency_basic', 'agency_pro']),
	businessName: z.string().optional(),
	/** Only relevant for agency_basic — defaults to 10 if omitted. */
	clientLimit: z.number().int().positive().optional(),
	/** Operational label for routing logs. Defaults to contactName if omitted. */
	operationalName: z.string().optional(),
})

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
	try {
		await requirePlatformAdmin(event)

		const parsed = schema.safeParse(JSON.parse(event.body ?? '{}'))
		if (!parsed.success) {
			return jsonResponse(400, {
				error: 'Invalid input',
				details: parsed.error.flatten(),
			})
		}

		const tenantId = randomUUID()
		const profile = await createTenantProfile(tenantId, {
			...parsed.data,
			operationalName: parsed.data.operationalName ?? parsed.data.contactName,
		})

		return jsonResponse(201, profile)
	} catch (err) {
		return errorResponse(err)
	}
}
