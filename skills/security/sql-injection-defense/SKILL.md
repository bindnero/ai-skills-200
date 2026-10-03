---
name: sql-injection-defense
description: Removes SQL injection risk by replacing string-built queries with parameterized statements, allowlisted identifiers, and least-privilege database roles. Use when writing or reviewing ORM raw queries, dynamic ORDER BY or table selection, migrations, or any query assembled with concatenation or f-strings.
---

# SQL Injection Defense

**Use when:** any SQL statement, ORM escape hatch (`raw`, `queryRaw`, `sequelize.query`, `extra`, `$queryRawUnsafe`), or report/filter builder constructs SQL text from variable, request, or configuration input.
**Do not use when:** the threat is a query issued by the database itself or an identifier chosen at deploy time from a closed internal set — use `supply-chain-security` for vulnerable driver versions.

## Instructions

1. Find every query-construction site. Search for string interpolation into SQL, `+` concatenation, f-strings containing `SELECT`/`INSERT`/`UPDATE`/`DELETE`/`WHERE`, `format()` calls near query text, and ORM methods whose parameter is raw SQL rather than bound values.
2. Classify each interpolated value: a value (bind parameter), an identifier (column/table/schema name), or a keyword fragment (`ORDER BY`, `LIMIT`). Values bind; identifiers and keywords do not — they require allowlisting.
3. Replace value interpolation with the driver's native parameter binding for the language in use. Never concatenate quotes, escape manually, or use a helper that builds SQL strings.
4. For dynamic identifiers, map external input to a server-side allowlist of known-good identifiers and use the mapped value, never the raw input. Reject anything not in the map with a 400.
5. For `ORDER BY` and direction, resolve to a column object or a fixed literal from an allowlist. A sort key arriving from the client is an identifier request even though it looks like a value.
6. Use `LIKE` carefully: bind the pattern value, and if you need wildcard semantics from user input, escape `%`, `_`, and the escape character in the bound value and specify an explicit `ESCAPE` clause.
7. Enforce least privilege for the application's database role: no `SUPERUSER`, no DDL at runtime, no access to other schemas, and separate read-only roles for analytics. Parameterization does not protect against a role that can drop tables.
8. Disable or strictly control stored-procedure construction with `EXEC`/`EXECUTE IMMEDIATE` of a built string, and avoid `format()`-style dynamic SQL inside functions where a static statement will do.
9. Add a regression test per fixed injection point using a benign probe payload such as `' OR '1'='1` and a tautology that would change row count. Assert the response is a normal 400 or a correct empty result and that no SQL error text is returned.
10. Return generic error responses and log the SQLSTATE with a correlation ID server side. Never surface driver error strings to clients; they disclose table and column names.

## Patterns

Native binding by language:

```python
# psycopg / psycopg2 - never % or .format() into the statement
cur.execute(
    "SELECT id, email FROM users WHERE tenant_id = %s AND status = %s",
    (tenant_id, status),
)

# SQLAlchemy text() with bound params for a dynamic value
from sqlalchemy import text
stmt = text("SELECT * FROM orders WHERE customer_id = :cid AND created_at > :since")
rows = session.execute(stmt, {"cid": cid, "since": since}).all()

# Django raw() must use params, never string substitution
Order.objects.raw("SELECT * FROM orders WHERE region_id = %s", [region_id])
```

```typescript
// node-postgres / pg - $1..$n are wire-protocol parameters, not text substitution
const { rows } = await pool.query(
  "SELECT id, total FROM orders WHERE customer_id = $1 AND state = $2",
  [customerId, state]
);

// Prisma raw queries: tagged template only
const rows = await prisma.$queryRaw`SELECT id FROM orders WHERE email = ${email}`;
```

```go
// database/sql - placeholders, driver handles escaping
row := db.QueryRowContext(ctx,
  "SELECT id FROM api_keys WHERE token_hash = $1 AND revoked_at IS NULL", hash)
```

Allowlisting identifiers — the required pattern for dynamic sort and filters:

```python
SORTABLE = {
    "created": "created_at",
    "total":  "total_cents",
    "name":   "customer_name",
}
DIRECTIONS = {"asc": "ASC", "desc": "DESC"}

def build_order_clause(request) -> str:
    column = SORTABLE.get(request.query_params.get("sort", "created"))
    if column is None:
        raise ValidationError("unsupported sort key")
    direction = DIRECTIONS.get(request.query_params.get("dir", "desc"), "DESC")
    # Both tokens come from the maps above, not from the request.
    return f" ORDER BY {column} {direction} LIMIT %s OFFSET %s"
```

Escaping wildcards inside a bound LIKE pattern:

```python
def like_pattern(raw: str) -> str:
    escaped = raw.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"
# Query: WHERE name LIKE %s ESCAPE '\'   with the pattern above as the bound value
```

## Checklist

- [ ] No SQL text is built by concatenation, f-string, `%` formatting, or `.format()` from request-derived input.
- [ ] Every value interpolation uses the driver's native bound-parameter mechanism.
- [ ] Dynamic table, column, schema, `ORDER BY`, and sort-direction inputs resolve through a server-side allowlist and unknown values return 400.
- [ ] ORM raw-query methods receive params or tagged templates, not pre-interpolated strings.
- [ ] `LIKE` patterns escape `%`, `_`, and the escape character and declare an explicit `ESCAPE` clause.
- [ ] The application's database role lacks DDL, superuser, and cross-schema privileges.
- [ ] Database error text never reaches the client; failures return a generic message plus a correlation ID.
- [ ] Each remediated site has a test with a benign injection probe asserting no error text and no unintended row count.

## Anti-patterns

- **Escaping quotes by hand or doubling apostrophes.** This is bypassable via encoding, numeric contexts, backslash handling in MySQL, and alternate character sets, and it depends on knowing whether the value is quoted. Use parameter binding and let the driver handle quoting.
- **Parameterized values plus concatenated identifiers.** Binding every value still leaves `ORDER BY` and table names open. Attackers exploit exactly this gap, because the value placeholders look reassuring. Allowlist identifiers separately.
- **"The ORM protects us."** ORM escapes-hatches (`raw`, `$queryRawUnsafe`, `sequelize.query` with a string, `Extra`, `literal_column`) bypass escaping entirely. Audit every call site, not just the model layer.
- **Blocklist keywords like `OR 1=1`.** Blocking specific tokens does not survive comments, encoding, or alternative syntax. There is no defensive value in a WAF keyword blocklist for parameterization; the two controls solve different problems.
- **Least privilege skipped.** If the app role can `DROP TABLE` or read other tenants' schemas, a single missed injection is a full data breach. Parameterization and role scoping must both be in place.