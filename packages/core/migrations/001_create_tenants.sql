-- Migration 001: CRM tenants table
-- Stores business profile and plan data for each tenant.
-- tenant_id is shared with DynamoDB as the correlation key.

CREATE TYPE tenant_plan AS ENUM ('solo', 'agency_basic', 'agency_pro');
CREATE TYPE tenant_status AS ENUM ('active', 'suspended');

CREATE TABLE IF NOT EXISTS tenants (
	tenant_id     UUID          PRIMARY KEY,
	business_name VARCHAR(255),
	contact_name  VARCHAR(255)  NOT NULL,
	contact_email VARCHAR(255)  NOT NULL,
	country       VARCHAR(100)  NOT NULL,
	plan          tenant_plan   NOT NULL DEFAULT 'solo',
	-- null = unlimited clients (agency_pro); 1 = solo; N = agency_basic cap
	client_limit  INTEGER,
	status        tenant_status NOT NULL DEFAULT 'active',
	created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
	updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenants_plan   ON tenants (plan);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants (status);
