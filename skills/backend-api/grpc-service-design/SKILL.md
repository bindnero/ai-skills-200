---
name: grpc-service-design
description: Designs protobuf service definitions with field-number-safe evolution, deadlines, and status codes. Use when defining or reviewing a `.proto` file, generated gRPC stubs, or the request/response contract between internal services.
---

# gRPC Service Design

**Use when:** you are writing or changing a `.proto` contract, wiring generated stubs, or choosing status codes and streaming modes.
**Do not use when:** the caller is a browser or an untrusted mobile client — use `rest-api-design` or `graphql-schema-design`.

## Instructions

1. Freeze field numbers on day one. `reserved 4, 7;` for every deleted field and never reuse a number; protobuf cannot distinguish a reused tag from the original, so clients silently mis-parse.
2. Never change a field's wire type. Numeric widening (`int32` to `int64`) is legal; `string` to `bytes`, `int32` to `bool`, and singular to repeated are not. Add a new number and deprecate the old.
3. Make additive changes by default: new fields are ignored by old clients and new RPCs are unknown-but-unbroken. Removal or rename needs a new service name — see `api-versioning`.
4. Choose streaming by shape: unary for request/response, server-stream for a result set discovered incrementally, client-stream for client-produced batches, bidi for genuine bidirectional interaction.
5. Set deadlines on every call and propagate the inbound `grpc-timeout` header. A unary RPC without a deadline hangs until the transport dies.
6. Reserve status codes by meaning: `INVALID_ARGUMENT` permanent client error, `FAILED_PRECONDITION` wrong state, `UNAVAILABLE` retryable, `ALREADY_EXISTS` create conflict. Returning `INTERNAL` for a validation failure disables client retries and hides the bug.
7. Put protobuf data in messages, not headers. Headers are for auth, tracing, and routing; large payloads there hit the 8 KB metadata limit.
8. Annotate `google.api.field_behavior` REQUIRED and IMMUTABLE, and generate validation and tests from the annotations instead of hand-written assertions.

## Patterns

Proto contract built to survive evolution:

```protobuf
syntax = "proto3";
package billing.v2;

import "google/protobuf/timestamp.proto";
import "google/api/annotations.proto";
import "google/api/field_behavior.proto";
import "google/api/http.proto";

message Invoice {
  string id = 1 [(google.api.field_behavior) = REQUIRED];
  string account_id = 2 [(google.api.field_behavior) = REQUIRED];

  // Renamed from "amount" in v2. Numbers 3, 5, 9 are permanently retired.
  reserved 3, 5, 9;
  reserved "amount", "coupon_code", "trial_days";

  int64 total_cents = 11 [(google.api.field_behavior) = REQUIRED];
  string currency_code = 12 [(google.api.field_behavior) = REQUIRED];
  google.protobuf.Timestamp issued_at = 13 [(google.api.field_behavior) = REQUIRED];

  // New optional field: old servers omit it, proto3 readers get the default.
  repeated string applied_credits = 15;
}

enum InvoiceState {
  INVOICE_STATE_UNSPECIFIED = 0;
  INVOICE_STATE_OPEN = 1;
  INVOICE_STATE_PAID = 2;
  INVOICE_STATE_VOID = 3;
}

message ListInvoicesRequest {
  string account_id = 1 [(google.api.field_behavior) = REQUIRED];
  string page_token = 2;   // opaque cursor, ordered by (issued_at, id)
  int32 page_size = 3;
}
message ListInvoicesResponse { repeated Invoice invoices = 1;  string next_page_token = 2; }

service BillingService {
  rpc GetInvoice(GetInvoiceRequest) returns (Invoice) {
    option (google.api.http) = { get: "/v2/accounts/{account_id}/invoices/{id}" };
  }
  rpc ListInvoices(ListInvoicesRequest) returns (ListInvoicesResponse) {
    option (google.api.http) = { get: "/v2/accounts/{account_id}/invoices" };
  }
  rpc SyncUsage(stream UsageSample) returns (stream UsageSummary); // bidi: incremental pricing
}
```

Server handler with deadline propagation and correct status mapping:

```ts
import type { ServerUnaryCall } from "@grpc/grpc-js";
import { Status } from "google-gax";

export async function listInvoices(call: ServerUnaryCall<ListInvoicesRequest, ListInvoicesResponse>): Promise<void> {
  const { account_id, page_token, page_size = 50 } = call.request;
  const principal = (call as { principal?: Principal }).principal;

  if (!account_id) return call.callback({ code: Status.INVALID_ARGUMENT, message: "account_id is required" });
  if (page_size < 1 || page_size > 200) return call.callback({ code: Status.INVALID_ARGUMENT, message: "page_size must be 1-200" });
  if (!principal!.accounts.includes(account_id)) return call.callback({ code: Status.PERMISSION_DENIED, message: "Account out of scope" });

  try {
    const page = await invoices.list({ accountId: account_id, cursor: page_token, limit: page_size });
    call.callback(null, { invoices: page.rows, next_page_token: page.nextCursor ?? "" });
  } catch (err) {
    if (err instanceof UniqueViolation) return call.callback({ code: Status.ALREADY_EXISTS, message: "Invoice exists for this period" });
    if (err instanceof TemporaryUnavailable) return call.callback({ code: Status.UNAVAILABLE, message: "Ledger store unavailable" });
    call.callback({ code: Status.INTERNAL, message: "Unhandled store failure" });
  }
}
```

Client call with a propagated deadline:

```ts
import { credentials, Metadata } from "@grpc/grpc-js";

const client = new BillingServiceClient(`billing.${process.env.REGION}.svc:8443`, credentials.createSsl());

const md = new Metadata({ authorization: `Bearer ${accessToken}` });
const deadline = new Date(Date.now() + 2_000); // always bound the wait

const page = await new Promise<ListInvoicesResponse>((resolve, reject) =>
  client.listInvoices({ account_id: "acct_77", page_size: 50 }, md, { deadline }, (err, res) => (err ? reject(err) : resolve(res))),
);
```

## Checklist

- [ ] Every retired field number and name is in a `reserved` block
- [ ] No existing field changed type, cardinality, or name in this change
- [ ] Every unary call sets or propagates a deadline
- [ ] Client errors use `INVALID_ARGUMENT`/`FAILED_PRECONDITION`/`ALREADY_EXISTS`
- [ ] Retryable conditions use `UNAVAILABLE`/`DEADLINE_EXCEEDED`
- [ ] Streaming mode matches the interaction shape
- [ ] `google.api.field_behavior` marks required and immutable fields
- [ ] `buf breaking` or equivalent runs in CI against the previous revision

## Anti-patterns

**Reusing a deleted field number.** The tag becomes ambiguous: an old client sending the retired field parses your new field with the same number as an unrelated value, silently. Reserve removed numbers permanently.

**Infinite deadlines.** A call with no `deadline` option consumes a slot in the caller's pool until the connection times out. Set one and shrink it at every network hop.

**`INTERNAL` as the universal error.** Callers cannot distinguish a bad request from a retryable outage, so retry policy is wrong in both directions and client mistakes show up as server incidents. Map to the specific `google.rpc.Code`.

**Fat metadata.** Passing a base64 payload through custom headers hits the 8 KB metadata limit and defeats every interceptor that logs headers. Move the data into a streamed message.