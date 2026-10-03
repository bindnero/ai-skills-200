---
name: mcp-server-design
description: Builds Model Context Protocol servers exposing typed tools, resources, and prompts with stdio or HTTP transport and session handling. Use when publishing tools to MCP clients, when debugging capability negotiation, or when exposing internal APIs to an agent runtime.
---

# MCP Server Design

**Use when:** you are exposing tools, resources, or prompts to MCP clients such as editors and agent runtimes.
**Do not use when:** you only need tools inside your own application — a direct function-call loop is simpler; see `tool-calling-design`.

## Instructions

1. Choose the primitive per capability: `tools` for actions with side effects or parameters, `resources` for readable context by URI, and `prompts` for reusable user-facing message templates. Do not wrap a resource in a tool.
2. Write each tool description as a contract including when to call it, what it returns, and the sibling tool not to use — the same rule as function schemas, because clients surface them identically.
3. Use strict JSON Schema for every input: `additionalProperties: false`, all properties required, enums for closed sets, and a `description` on every field.
4. Return results as MCP content blocks. Use `text` for plain strings, structured content for machine-readable data, and `isError` for handled failures rather than throwing protocol errors.
5. Model domain failures as results, not exceptions. A "customer not found" is a normal outcome; a transport-level crash is an error.
6. Keep the server stateless where clients allow it. With stateful HTTP sessions, issue the session id in the initialize handshake, validate it on every request, and bind it to the authenticated principal.
7. Do stdio for local subprocess servers and Streamable HTTP for remote and multi-user servers. Never expose a stdio server over the network.
8. Paginate large list operations with cursor-based limits and return an opaque cursor; a tool that returns 50,000 records will exhaust the client's context.
9. Annotate tools with behavioural hints the spec supports, such as read-only and idempotent hints, so clients can auto-approve safe calls; add `listChanged` notifications and subscriptions only when you actually implement updates.

## Patterns

Python server exposing typed tools and resources over stdio (started with `mcp.run()`):

```python
from mcp.server.fastmcp import FastMCP
from pydantic import BaseModel, Field

mcp = FastMCP("northwind-ops")
class SearchOrders(BaseModel):
    status: str = Field(pattern="^(pending|paid|shipped|refunded|cancelled)$")
    customer_id: str | None = None
    limit: int = Field(default=25, ge=1, le=100)

@mcp.tool(
    description="Search orders by lifecycle status or customer. Returns order summaries only. "
                "Do not use for line items — call get_order. Do not use for refunds.",
    annotations={"readOnlyHint": True, "idempotentHint": True},
)
def search_orders(args: SearchOrders) -> dict:
    rows = orders.search(status=args.status, customer_id=args.customer_id, limit=args.limit)
    return {"orders": [{"id": r.id, "status": r.status, "total_cents": r.total_cents} for r in rows]}

@mcp.resource("orders://{order_id}")
def order_resource(order_id: str) -> str:
    return orders.get(order_id).to_json()
```

TypeScript server over Streamable HTTP with session validation:

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import express from "express";
const server = new McpServer({ name: "northwind-ops", version: "1.4.0" });
const sessions = new Map<string, string>();          // sessionId -> principal

server.registerTool(
  "issue_refund",
  {
    description: "Issue a refund against a settled payment. Returns the refund id. " +
                 "Requires a settled payment id. Do not use for authorization voids.",
    inputSchema: {
      payment_id: z.string().describe("Settled payment id, not an order id."),
      amount_cents: z.number().int().positive().describe("USD cents."),
      reason: z.enum(["duplicate", "customer_request", "service_not_delivered", "other"]),
    },
    annotations: { readOnlyHint: false, idempotentHint: true },
  },
  async ({ payment_id, amount_cents, reason }, extra) => {
    const principal = sessions.get(extra.sessionId!);
    const decision = await authorize(principal, "write_irreversible", payment_id);
    if (decision.decision !== "allow") {
      return { isError: true, content: [{ type: "text", text: decision.reason }] };
    }
    const refund = await payments.refund({ paymentId: payment_id, amountCents: amount_cents, reason });
    return { content: [{ type: "text", text: JSON.stringify({ refund_id: refund.id }) }] };
  },
);

const app = express();
app.use(express.json());
app.post("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (sessionId && !sessions.has(sessionId)) return res.status(404).json({ error: "unknown session" }).end();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => crypto.randomUUID() });
  transport.onsessioninitialized = (id) => sessions.set(id, principalFrom(req));
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});
app.listen(8080);
```

Paginated resource listing, so a client never receives an unbounded table:

```ts
server.registerResource(
  "customer-directory", "customers://directory",
  { description: "Customer directory, paginated.", mimeType: "application/json" },
  async (_uri, { cursor }) => {
    const page = await customers.list({ cursor: cursor?.toString(), limit: 100 });
    return { contents: [{ uri: `customers://directory?cursor=${page.next ?? ""}`,
                          mimeType: "application/json", text: JSON.stringify(page.items) }] };
  },
);
```

## Checklist

- [ ] Each capability mapped to the right primitive: tool, resource, or prompt
- [ ] Tool descriptions include the when-to-call, what-it-returns, and sibling-exclusion clause
- [ ] Input schemas strict with descriptions on every field and enums for closed sets
- [ ] Domain failures returned as `isError` results, not raised as exceptions
- [ ] stdio for local subprocess servers; Streamable HTTP with session-id validation for remote ones
- [ ] List operations paginated with cursors and a hard maximum page size; behaviour annotations set

## Anti-patterns

**Resource exposed as a tool.** Making every capability a tool call means the client cannot discover or subscribe to readable context and every read burns a round trip. Expose stable data as resources with URIs.

**Exceptions for domain errors.** Throwing on "not found" turns a normal outcome into a transport-level failure that clients surface as a crash. Return an `isError` result with a usable message.

**Unpaginated listing.** Returning the whole customer or order table to fill a context window guarantees a timeout or a context overflow. Page with cursors and cap the page size.

**stdio exposed over the network.** Wrapping a stdio server in an HTTP shim without session isolation and auth turns local tooling into an unauthenticated remote execution surface. Use Streamable HTTP with session validation and authorization.

**Descriptions copied from internal docs.** Porting an internal service description gives the client no boundary information, so tools get selected wrongly. Rewrite each description for the calling agent.
