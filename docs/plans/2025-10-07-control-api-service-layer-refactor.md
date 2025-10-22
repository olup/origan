# Control API Service Layer Architecture Refactor

**Date:** 2025-10-07
**Status:** Planning
**Priority:** High
**Last Updated:** 2025-10-12 (Review incorporated)

## Review Findings Incorporated

The following review findings have been incorporated into this plan:

1. **✅ No Separate Lookup Service**: The proposed `lookup.service.ts` would duplicate helpers already exposed in `organization.service.ts` (e.g., `getUserOrganizations()` at line 33) and `project.service.ts` (e.g., `getProject()` at line 61). Instead, we'll extend these existing services with membership-aware lookup methods.

2. **✅ Token Hashing Security**: The auth router extraction must explicitly preserve the refresh token hashing semantics. The current implementation uses `hashToken()` at auth.ts:97 (before query) and auth.ts:177 (before revocation) to ensure tokens are never stored in plain text. This MUST be maintained in the service layer.

3. **✅ Direct DB Access for Lightweight Lookups**: An open question about which routers need direct `db` access has been addressed. The github router (webhook handler) is the only legitimate case for minimal direct access. All other routers will have direct DB access eliminated through service layer methods. The ESLint rule will allow escape hatches with justification comments.

## Overview

This plan outlines a refactoring effort to establish a cleaner service-oriented architecture in the control API by decoupling business logic and database access from routers. The goal is to move all direct database calls and business logic into dedicated service modules, leaving routers as thin orchestration layers.

## Current State Analysis

### Existing Service Structure

The codebase already has several service modules in `packages/control-api/src/service/`:
- `build/` - Build management services
- `certificate.service.ts` - Certificate operations
- `deployment.service.ts` - Deployment operations (already well-structured)
- `dns.service.ts` - DNS operations
- `domain.service.ts` - Domain management (already well-structured)
- `environment.service.ts` - Environment variable management
- `github.service.ts` - GitHub integration
- `organization.service.ts` - Organization operations (already well-structured)
- `project.service.ts` - Project operations (already well-structured)
- `track.service.ts` - Track (environment/branch) management

### Issues Identified

#### 1. **Projects Router** (`trpc/routers/projects.ts`)

**Problems:**
- Lines 33-36: Direct DB query for organization lookup in `list` procedure
- Lines 52-56: Direct DB query for organization lookup in `create` procedure
- Lines 78-88: Direct DB query with complex relations in `get` procedure
- Lines 108-110: Direct DB query for project lookup in `update` procedure
- Lines 152-154: Direct DB query for project lookup in `setGithubConfig` procedure
- Lines 176-178: Direct DB query for project lookup in `removeGithubConfig` procedure
- Lines 200-209: Direct DB query with complex relations in `triggerDeploy` procedure
- Lines 272-274: Direct DB query for project lookup in `listTracks` procedure

**Impact:** High - This is a heavily used router with many direct DB calls

#### 2. **Organizations Router** (`trpc/routers/organizations.ts`)

**Problems:**
- Lines 12-23: Direct DB query with join in `list` procedure
- Lines 35-46: Direct DB query with join in `get` procedure
- Lines 64-78: Direct DB insert operations in `create` procedure (both organization and membership)

**Impact:** Medium - Core operations but simpler than projects router

#### 3. **Deployments Router** (`trpc/routers/deployments.ts`)

**Problems:**
- Lines 155-157: Direct DB query for project lookup in `getConfig` procedure
- Lines 188-194: Direct DB query with relations in `getConfigByDomain` procedure
- Lines 248-250: Direct DB query for project lookup in `listByProject` procedure

**Impact:** Medium - Service layer exists but some routers still bypass it

#### 4. **Environments Router** (`trpc/routers/environments.ts`)

**Problems:**
- Lines 24-26: Direct DB query for project lookup in `listByProject` procedure
- Lines 55-57: Direct DB query for project lookup in `getVariablesByName` procedure
- Lines 98-100: Direct DB query for project lookup in `setVariables` procedure
- Lines 133-135: Direct DB query for project lookup in `unsetVariable` procedure

**Impact:** Medium - Repetitive pattern of project lookups before service calls

#### 5. **Auth Router** (`trpc/routers/auth.ts`)

**Problems:**
- Lines 33-37: Direct DB insert for auth session in `initializeCLISession` procedure
- Lines 52-56: Direct DB query for auth session in `checkCLISession` procedure
- Lines 71-73: Direct DB delete for auth session cleanup
- Lines 100-106: Direct DB query for refresh token validation in `refreshToken` procedure
- Lines 116-118: Direct DB query for user lookup
- Lines 152-154: Direct DB query for user in `me` procedure
- Lines 180-183: Direct DB update to revoke refresh token in `logout` procedure

**Impact:** High - Security-critical operations mixed with DB access

#### 6. **Logs Router** (`trpc/routers/logs.ts`)

**Status:** Not analyzed in detail yet, but likely has similar patterns

#### 7. **GitHub Router** (`routers/github.ts`)

**Status:** Webhook handler - delegates to `github.service.ts` (already well-structured)

## Refactoring Strategy

### Phase 1: Create Missing Services

Extend or add service modules where the routers still own core logic:

1. **`service/auth.service.ts`**
   - `createAuthSession()`
   - `checkAuthSession(sessionId)`
   - `completeAuthSession(sessionId, tokens)`
   - `validateRefreshToken(token)`
   - `revokeRefreshToken(token)`
   - `getUserById(userId)`
   - **CRITICAL**: Preserve the existing hashed refresh-token storage semantics (no plain-text tokens). The current implementation uses `hashToken()` at auth.ts:97 before querying refreshTokenSchema - this MUST be maintained in the service layer to ensure tokens remain hashed at rest.

2. **Organization / Project service helpers**
   - ✅ **UPDATED APPROACH**: The review correctly identified that `organization.service.ts` and `project.service.ts` already expose helpers like `getUserOrganizations()` (organization.service.ts:33) and `getProject()` (project.service.ts:61)
   - Instead of creating a separate `lookup.service.ts`, extend the existing service methods:
     - Add membership-aware `getOrganizationByReferenceWithMembership(reference, userId)` to organization.service.ts
     - Extend `getProject()` to support more flexible lookups (already supports `reference` parameter)
   - Reuse these helpers across routers instead of introducing a standalone lookup service

### Phase 2: Refactor Routers (Priority Order)

#### High Priority

1. **Auth Router**
   - Move all session management to `auth.service.ts`
   - Move all token operations to `auth.service.ts`
   - Move user lookups to `auth.service.ts`
   - Router should only handle cookie operations and TRPC error mapping

2. **Projects Router**
   - Move organization lookup logic to `organization.service.ts` or create helper in `project.service.ts`
   - Add `getProjectByReference()` method to `project.service.ts` (already has `getProject()` but needs reference-based version)
   - Ensure all project operations go through `project.service.ts`
   - Consider adding `getProjectWithRelations()` for complex queries

#### Medium Priority

3. **Organizations Router**
   - Move all organization CRUD to `organization.service.ts`
   - Add methods:
     - `getUserOrganizations(userId)` - already exists but not used by router
     - `getOrganizationByReference(reference, checkMembership?)` - already exists as `getOrganizationByReference()` but needs membership check
     - `createOrganization(name, creatorUserId)`

4. **Environments Router**
   - Remove direct project lookups from router
   - Pass project reference/ID to environment service methods
   - Have environment service call `project.service.getProject()` internally for validation (don't duplicate the project lookup logic)

5. **Deployments Router**
   - Move remaining DB queries to `deployment.service.ts`
   - Add helper methods for domain-based lookups

#### Low Priority

6. **Logs Router**
   - Analyze and apply similar patterns

### Phase 3: Establish Architecture Guidelines

1. **Router Responsibilities:**
   - Input validation (Zod schemas)
   - Authentication/authorization checks (via middleware or explicit checks)
   - Service method calls
   - Error transformation (service errors → TRPC errors)
   - Response formatting

2. **Service Responsibilities:**
   - Business logic
   - Database queries (for their own domain entities)
   - Data validation
   - Complex operations
   - Transaction management
   - Custom error throwing (with custom error classes)
   - **Calling other services** - Services should reuse other service methods rather than duplicating database queries (e.g., `environment.service.ts` should call `project.service.getProject()` instead of doing its own project lookup)

3. **Forbidden in Routers:**
   - Direct `db` imports
   - Direct SQL/Drizzle queries
   - Business logic decisions
   - Complex data transformations

## Implementation Tasks

### Task 1: Create Auth Service
- [ ] Create `service/auth.service.ts`
- [ ] Implement session management functions
- [ ] Implement token validation functions
- [ ] **CRITICAL**: Extract the token hashing logic from auth.ts:22-23 (`hashToken()`) and ensure refresh tokens remain hashed at rest throughout the entire flow (storage, validation, rotation) - reference current implementation at auth.ts:97 and auth.ts:177
- [ ] Add tests for auth service, including explicit tests that tokens are never stored in plain text

### Task 2: Refactor Auth Router
- [ ] Replace direct DB calls with auth service calls
- [ ] Keep only cookie operations in router
- [ ] Update error handling
- [ ] Test authentication flows
- [ ] **CRITICAL**: Confirm hashed refresh-token storage/rotation still works end-to-end - verify that the token hashing at auth.ts:97 (before lookup) and auth.ts:177 (before revocation) is preserved in the service layer

### Task 3: Enhance Organization Service
- [ ] Add `getUserOrganizations()` wrapper if needed
- [ ] Add `createOrganization()` with membership
- [ ] Add membership validation helpers
- [ ] Add tests

### Task 4: Refactor Organizations Router
- [ ] Replace direct DB calls with organization service calls
- [ ] Test organization CRUD operations

### Task 5: Enhance Project Service
- [ ] Add `getProjectByReferenceWithOrg()` helper
- [ ] Consider adding organization lookup helpers
- [ ] Ensure all project operations are covered
- [ ] Add tests

### Task 6: Refactor Projects Router
- [ ] Replace all direct DB queries with service calls
- [ ] Consolidate organization lookup logic
- [ ] Test all project operations

### Task 7: Harden Shared Lookup Helpers
- [ ] Extend `organization.service.ts` with membership-aware reference lookups reused by routers (e.g., `getOrganizationByReferenceWithMembership()`)
- [ ] Verify `project.service.ts` already supports reference-based lookups via `getProject({ reference, organizationId })` at project.service.ts:61
- [ ] ✅ **REVIEW FINDING INCORPORATED**: Do NOT create a standalone `lookup.service.ts` - reuse and extend existing helpers in organization.service.ts and project.service.ts instead

### Task 8: Refactor Remaining Routers
- [ ] Environments router - ensure it calls `project.service.getProject()` instead of duplicating project lookups
- [ ] Deployments router (remaining queries) - ensure it calls `project.service.getProject()` instead of duplicating project lookups
- [ ] Logs router - apply same pattern of service-to-service calls

### Task 9: Architecture Documentation
- [ ] Document router patterns
- [ ] Document service patterns
- [ ] Create PR review checklist for new code
- [ ] Add ESLint rules to prevent `db` imports in routers (if possible)

### Task 10: Add Linting/Enforcement
- [ ] Configure ESLint to warn/error on `db` imports in `trpc/routers/` directory
- [ ] Add pre-commit hooks if needed
- [ ] Update CI/CD checks

## Benefits

1. **Better Separation of Concerns**: Clear boundary between presentation (routers) and business logic (services)
2. **Improved Testability**: Services can be tested independently without TRPC context
3. **Code Reusability**: Service methods can be called from multiple routers or background jobs
4. **Easier Maintenance**: Business logic changes don't affect router structure
5. **Type Safety**: Centralized service methods provide better type inference
6. **Transaction Management**: Complex operations with multiple DB calls can be properly wrapped in transactions within services
7. **Consistent Error Handling**: Services can throw custom errors that routers translate to appropriate HTTP/TRPC responses

## Migration Approach

1. **Non-Breaking**: Keep existing code working while refactoring
2. **Incremental**: One router at a time, one endpoint at a time
3. **Test-Driven**: Ensure all existing tests pass after each refactor
4. **Review**: Code review each phase before moving to the next

## Success Criteria

- [ ] No direct `db` imports in any TRPC router file
- [ ] All business logic resides in service modules
- [ ] All database queries happen in service modules
- [ ] Routers are under 200 lines (ideally under 150)
- [ ] Each service has comprehensive unit tests
- [ ] Architecture documentation is complete
- [ ] Linting rules prevent future violations

## Timeline Estimate

- **Phase 1** (Create Missing Services): 2-3 days
- **Phase 2** (Refactor Routers): 5-7 days
  - Auth Router: 1 day
  - Projects Router: 2 days
  - Organizations Router: 1 day
  - Other Routers: 1-2 days
- **Phase 3** (Documentation & Enforcement): 1-2 days

**Total: 8-12 days** (1.5-2.5 weeks)

## Open Questions & Resolutions

### Question: Which routers still need direct `db` access for lightweight lookups?

**Analysis**: After grepping the codebase, the following routers currently import `db`:
- `projects.ts` - Multiple direct queries (high priority refactor)
- `deployments.ts` - Some direct queries bypassing existing service
- `auth.ts` - Session and token management (high priority refactor)
- `github.ts` - Webhook handler (already delegates to github.service.ts, may need minimal db access for GitHub installation discovery)
- `organizations.ts` - Organization CRUD with direct queries
- `environments.ts` - Project lookups before service calls

**Resolution**:
- The github router is the only legitimate case where lightweight `db` access may be acceptable for GitHub installation discovery, as this is a webhook entry point that needs fast lookups
- All other routers should have their direct `db` access eliminated through service layer methods
- The proposed ESLint rule (Task 10) should allow an escape hatch (e.g., `// eslint-disable-next-line` with a comment justification) for the rare cases where direct access is truly necessary
- When implementing the lint rule, we can use `overrides` to exclude specific files if needed, but preference is to eliminate all direct access

## Notes

- The `deployment.service.ts`, `domain.service.ts`, `project.service.ts`, and `organization.service.ts` are already well-structured and serve as good examples
- Consider whether authorization checks should be in services or routers (recommendation: keep in routers via middleware, but validate ownership in services)
- Some project lookups could be optimized by accepting both reference and ID in service methods
- Consider using a transaction helper pattern for complex operations spanning multiple tables
- **Service-to-Service Calls**: Services should call other services for cross-domain lookups rather than duplicating database queries. For example:
  - ✅ GOOD: `environment.service.ts` calls `project.service.getProject()` to validate project exists
  - ❌ BAD: `environment.service.ts` does its own `db.query.projectSchema.findFirst()`
  - This reduces duplication and ensures consistent validation logic across the codebase
