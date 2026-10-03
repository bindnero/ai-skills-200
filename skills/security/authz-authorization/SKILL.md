---
name: authz-authorization
description: Enforces authorization on every request with server-side policy checks, default-deny object ownership, and centralized middleware, preventing broken function-level and object-level access control. Use when adding or reviewing endpoints that act on a specific record, introducing roles or tenancy, or fixing "user can see other users' data" reports.
---

# Authorization Enforcement

**Use when:** an endpoint or job performs an action on a specific resource, role or tenant distinctions are introduced, or an IDOR/BOLA report needs to be traced to its root cause.
**Do not use when:** determining who the caller is — use `multi-factor-auth` or `password-handling`; this skill starts after identity is established.

## Instructions

1. Classify the resource model and the privilege model: anonymous, authenticated, role-based, tenant-scoped, attribute-based (ownership, status, region, plan tier). Write down which one applies to each operation before writing checks.
2. Decide where enforcement lives. Prefer a centralized policy layer (middleware, dependency injection, framework permission class) so a route cannot be added without a declared requirement, rather than hand-written checks scattered in handlers.
3. Default to deny. If no policy matches the (principal, action, resource) triple, reject with 403. Never treat an undeclared route or an unlisted action as permitted.
4. Resolve the resource through the caller's scope, not the caller's identifier. Fetch with both the resource id and the caller's tenant or owner in the query so a foreign id returns nothing rather than an object you then have to reject.
5. Enforce the check on every path that reaches the resource: direct HTTP route, GraphQL resolver, internal admin route, background job, webhook replay, export or bulk endpoint, and cache layer. The most common authorization bug is a second, unlisted path.
6. Check function-level authorization too: the correct object returned to a member of the wrong role is still a breach. Verify role membership server-side rather than trusting a role claim carried in the request.
7. Never accept identity or scope from a request header or body — `X-User-Id`, `X-Tenant-Id`, `role` in a JSON payload, or a client-signed claim — without verifying it cryptographically and constraining it to a subset the principal may claim.
8. Make tenant separation enforceable in the data layer where practical: row-level security in Postgres, a mandatory tenant filter in the repository layer, or separate databases. Application-only tenant filters are one forgotten `get()` away from a breach.
9. Log authorization decisions — principal, action, resource id, allow or deny — at debug or audit level, and alert on repeated denials for a single principal, which indicate probing for an IDOR.
10. Add a negative test per protected route asserting 403 for a low-privilege user, a foreign-tenant user, and an unauthenticated caller, and assert that no data changed.

## Patterns

Scope the query to the principal — BOLA fix:

```python
# Wrong: fetch then check. Leaks existence and is easy to forget the check.
invoice = Invoice.objects.get(id=invoice_id)
if invoice.tenant_id != request.user.tenant_id:
    raise PermissionDenied

# Right: the foreign id simply does not resolve.
invoice = get_object_or_404(
    Invoice.objects.filter(tenant_id=request.user.tenant_id), id=invoice_id
)
```

Centralized declaration so new routes must state their policy:

```python
# FastAPI dependency: no policy registered => deny by default
from fastapi import Depends, HTTPException

POLICIES: dict[tuple[str, str], str] = {
    ("invoice", "read"):  "tenant_member",
    ("invoice", "delete"): "tenant_admin",
}

def authorize(resource: str, action: str, principal = Depends(current_principal)):
    rule = POLICIES.get((resource, action))
    if rule is None:
        raise HTTPException(403, "no policy declared for this operation")
    if not principal.satisfies(rule):
        raise HTTPException(403, "insufficient privilege")
    return principal

@app.delete("/api/invoices/{invoice_id}", dependencies=[Depends(authorize("invoice", "delete"))])
def delete_invoice(invoice_id: int): ...
```

Database-enforced tenant isolation:

```sql
-- Postgres row-level security: the connection sets the tenant once per session.
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON invoices
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- Every query is then scoped automatically, including ad-hoc ones.
```

Reactivity side guard (do not rely on this for security):

```typescript
// Convenience only. The server must still authorize on every request;
// client-side hiding is not a control, and bulk/alternate routes bypass it.
<button hidden={!canDelete(invoice)} onClick={() => remove(invoice.id)}>Delete</button>

// Server, per object, every time:
if (invoice.tenantId !== session.user.tenantId) return 403;
```

## Checklist

- [ ] Every operation has a declared principal class and action, and the policy layer defaults to deny.
- [ ] Resources are fetched scoped to the caller, so a foreign id returns not-found rather than requiring a later comparison.
- [ ] All access paths are covered: REST, GraphQL, bulk, export, admin, background job, webhook replay, and cache.
- [ ] Role and tenant claims come from the session or a verified token, never from request headers or body fields.
- [ ] Absence of policy for an operation results in a rejection, tested explicitly.
- [ ] Denials are logged with principal, action, and resource id, and repeated denials raise an alert.
- [ ] Denied paths produce no state change and no data disclosure, including through error messages.
- [ ] A negative test covers unauthenticated, wrong-role, and foreign-tenant callers for each protected route.

## Anti-patterns

- **Check-after-fetch.** Retrieving by id and then comparing ownership is correct but fragile, and the record is already loaded into memory and process logs. Filter in the query.
- **Role from the client.** Accepting a `role`, `is_admin`, or `tenant_id` field from the request lets any user self-escalate. Identity and claims must originate from the server-side session or a signed token.
- **Authorization in the UI only.** Hiding a button does not stop a direct request, and every alternate route — API, GraphQL, bulk, export — is unprotected. Enforce on the server for all paths.
- **Deny by default flipped to allow for speed.** Temporarily commenting out a check to unblock a demo produces a permanent unauthenticated path in most codebases. Use a feature flag that is off by default and logged.
- **One role field for everything.** A single boolean `is_admin` collapses into privilege escalation the first time a support role needs read-only access. Model distinct permissions, not a single flag.