---
name: human-in-the-loop-workflows
description: Designs approval gates, confidence thresholds, edit-and-resume handoffs, and durable pause states for agent actions. Use when an agent must stop for approval before acting, when confidence-based auto-execution is needed, or when human edits must be reflected back into agent state.
---

# Human-in-the-Loop Workflows

**Use when:** an agent needs human judgement or authorization at specific points rather than running fully autonomously.
**Do not use when:** the check can be a deterministic rule or a test — replace the human gate with code; or when nothing about the action is consequential and fully automatic execution is safe.

## Instructions

1. Gate on consequence, not on confidence percentage. Irreversible, financial, permission-changing, or external-communication actions require approval regardless of how sure the model claims to be.
2. Place the gate immediately before the effect, after the plan is fully specified. Approval on a vague summary is consent to something the human never saw.
3. Render the approval request for the human, not the agent: the action, the target, the exact diff or values, the reasoning, and the reversibility. No chat transcript.
4. Make approval durable. Store a pending-action record with a stable id, the full arguments, an expiry, and resume context — do not keep the process alive waiting.
5. Implement approve, edit, reject, and expire as first-class outcomes. Human edits are the most common branch and the one most often dropped.
6. Feed human edits back as authoritative instruction. Re-enter the loop with the corrected action as the current state rather than asking the agent to reconcile its original plan.
7. Set auto-execute thresholds from measured reliability per action class, not a global number, and require both confidence and a low-stakes action class before skipping the gate.
8. Batch approvals: show the queued plan of non-dependent actions once, so a human approves five steps in one interaction rather than five prompts.
9. Give every gated action a stated blast radius and a defined rollback. An irreversible action without a documented undo is a "no" regardless of approval.
10. Log every gate decision with who, when, what changed, and why — approvals are audit records.

## Patterns

Durable pending-action record with an explicit state machine:

```ts
type PendingAction = {
  id: string;                          // stable, referenced in the approval UI
  kind: "execute" | "send" | "commit";
  blastRadius: string;
  reversible: boolean;
  undo?: string;
  arguments: Record<string, unknown>;
  rationale: string;
  proposedDiff: string;
  status: "pending" | "approved" | "edited" | "rejected" | "expired";
  decidedBy?: string;
  decidedAt?: string;
  expiresAt: string;
  resumeState: AgentState;             // enough state to continue without the process alive
};
```

Approval request rendered for a human:

```text
APPROVAL REQUIRED — action id act_7f2c

Action:     POST /v1/refunds  (financial, irreversible)
Target:     payment pay_88213, order #8812, $240.00 USD captured 2026-01-14
Arguments:  {"payment_id":"pay_88213","mode":"partial","amount_cents":24000,"reason":"service_not_delivered"}
Reversible: No. Refund can only be reversed by a new compensating refund.

Reasoning:  Customer reported the service was not delivered on 2026-01-12. Support
            ticket #4471 confirms. Policy auto-approves service_not_delivered under $500.

[Approve] [Edit] [Reject]   Expires 2026-01-16T12:00:00Z
```

Resume with the human edit treated as state:

```ts
export async function resolveApproval(action: PendingAction, decision: Decision) {
  if (decision.outcome === "reject") {
    return { next: { kind: "final", answer: "The user declined this action." }, exit: "done" };
  }
  const args = decision.outcome === "edit" ? decision.arguments : action.arguments;
  const result = await execute(action.kind, args, { idempotency_key: action.id });
  return {
    next: { kind: "final", answer: `Completed: ${action.kind}` },
    exit: "done",
    trace: { approvedBy: decision.by, changed: JSON.stringify(args) !== JSON.stringify(action.arguments) },
  };
}
```

Batched approval of a plan of independent actions:

```ts
const pending = plan.filter((a) => requiresApproval(a) && !alreadyApproved(a.id));
const batch = await approvals.requestBatch({
  items: pending.map((a) => ({ id: a.id, diff: a.proposedDiff, reversible: a.reversible })),
  expiresInHours: 24,
});
// Approve all / edit one / reject one — one human interaction, N actions.
```

Threshold policy per action class:

```text
Action class                        | Gate
read-only lookup                    | auto
draft generation                    | auto
send message to the customer        | always gated, low confidence or not
modify own org's data reversibly    | gated once per session
issue refund / wire money           | always gated, plus policy pre-check
delete anything                     | always gated, typed confirmation of resource id
```

## Checklist

- [ ] Gates keyed to consequence class, not to model confidence alone
- [ ] Gate placed after the action is fully specified and immediately before effect
- [ ] Approval view shows action, target, exact arguments, diff, and reversibility
- [ ] Auto-execute thresholds measured per action class; non-dependent queued actions batched into one approval
- [ ] Pending actions persisted with a stable id, expiry, and resumable state
- [ ] Approve, edit, reject, and expire all implemented; edits re-enter as authoritative state, not as a diff to reconcile
- [ ] Every gated action has a documented blast radius and rollback, or is refused
- [ ] All gate decisions logged with actor, timestamp, and whether arguments changed

## Anti-patterns

**Confidence-only gating.** "Auto-approve above 0.9 confidence" sends money on confident hallucinations, because confidence is not calibrated to consequence. Gate on action class and keep confidence only for automating low-blast-radius reads.

**Approval before specifics.** Asking "Shall I proceed?" before the plan is rendered produces consent to something the human never saw. Render the exact arguments and diff at the gate.

**In-memory waiting.** Holding a process open for hours waiting for approval loses state on every deploy and leaks connections. Persist a pending-action record and resume from it.

**Dropping the edit branch.** Implementing only approve and reject forces humans into all-or-nothing and pushes them to reject work they could have fixed in seconds. Implement edit and treat the edited values as authoritative state.

**One prompt per action.** Prompting five times for five queued steps trains users to approve reflexively. Batch the independent plan into a single approval.
