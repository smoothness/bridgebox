# API Testing & Documentation TODO
## Completed
- [x] Define an OpenAPI spec early as the single source of truth for endpoints, payloads, errors, and authentication.
- [x] Generate API docs from the OpenAPI spec (Redoc) and keep docs versioned in Git.
- [x] Add an API client/testing collection layer with Bruno, generated from OpenAPI.
## Pending
- [ ] Add automated API tests in CI, keeping Vitest for unit/integration and adding contract/integration checks against staging/deployed APIs.
- [ ] Add Bruno assertions for status/body validation on critical requests.
- [ ] Add environment-specific Bruno configs for local, staging, and production.
- [ ] Add a CI job that runs Bruno checks and fails the build on contract/test failures.
- [ ] Prioritize test coverage for:
  - [ ] Authentication and authorization edge cases
  - [ ] Validation and error schema consistency (including Zod-based validation paths)
  - [ ] Idempotency and retry behavior
  - [ ] Backward compatibility of response shapes
