# RFD 002: Organizations in Origan

## Summary

This RFD documents the introduction of organizations as a core concept in Origan. Organizations provide multi-tenancy support, allowing users to group projects and collaborate with team members. This change affects the database schema, API, CLI, and admin panel.

## Motivation

Previously, Origan operated in a single-tenant mode where projects were directly associated with users. This limited the platform's ability to facilitate team work, but also future features like organization-level settings, member management, and role-based permissions, or team billings.

## Design

### Core Concepts

**Organization**: A container for projects and team members
- Has a unique reference (e.g., `org_abc123def456`) as public identifier
- Has a display name
- Can have multiple members (users)
- Owns zero or more projects

**Organization Membership**: Links users to organizations
- Users can belong to multiple organizations
- First organization is created automatically during user signup

### Database Schema

```sql
-- Organizations table
organizations:
  - id: UUID (primary key)
  - reference: String (unique, public identifier)
  - name: String
  - createdAt: Timestamp
  - updatedAt: Timestamp

-- Organization membership
organization_memberships:
  - userId: UUID (foreign key to users)
  - organizationId: UUID (foreign key to organizations)
  - createdAt: Timestamp
  - Primary key: (userId, organizationId)

-- Projects now belong to organizations
projects:
  - organizationId: UUID (foreign key to organizations)
  -- other existing fields
```

### API Design

#### Organization Endpoints

```
GET    /organization/list
       Returns all organizations the authenticated user belongs to

GET    /organization/getByReference?reference={ref}
       Get organization details by reference

GET    /organization/listMembers?organizationReference={ref}  
       List all members of an organization
```

#### Project Endpoints (Modified)

```
GET    /projects?organizationReference={ref}
       List projects for the specified organization

POST   /projects
       Body: { name, organizationReference }
       Creates a project in the specified organization
```

### CLI Implementation

#### Organization Management Commands

```bash
origan orgs                    # List all organizations
origan switch <org-ref>        # Switch active organization
```

#### State Management

The CLI stores the current organization reference in the auth token file:
```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "currentOrganizationRef": "org_abc123def456"
}
```

#### Project Commands

All project-related commands now operate within the context of the selected organization:
- `origan projects` - Lists projects in current organization
- `origan deploy` - Deploys to project in current organization

### Admin Panel Implementation

#### Organization Context

A React context provides organization state throughout the app:
```typescript
interface OrganizationContextType {
  organizations: Organization[] | null;
  selectedOrganization: Organization | null;
  isLoading: boolean;
  selectOrganization: (orgReference: string) => void;
}
```

#### Organization Switcher

A dropdown component in the navigation allows users to:
- View current organization
- Switch between organizations
- See organization reference

#### Project Management

- Project list is filtered by selected organization
- Project creation includes organization reference
- No cross-organization project access

### User Flow

1. **First-time User**:
   - Signs up via GitHub OAuth
   - System creates default organization: "{username}'s Organization"
   - User lands in their organization

2. **Existing User**:
   - Logs in
   - CLI/Admin panel loads user's organizations
   - Previously selected organization is restored (CLI) or first organization is selected (Admin)

3. **Organization Switching**:
   - User runs `origan switch org_xyz` or uses dropdown in admin panel
   - All subsequent operations are scoped to that organization

### Future work
- Organization creation/deletion by users
- Organization member management (invite/remove)
- Organization-level settings
- Role-based permissions within organizations