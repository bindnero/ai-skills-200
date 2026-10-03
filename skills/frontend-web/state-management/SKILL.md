---
name: state-management
description: Decides where each piece of state belongs — component, URL, server cache, form, or global store — and implements it with narrow Zustand selectors, split contexts, or XState machines. Use when choosing between useState/context/store, fixing whole-tree re-renders from a wide context, or modelling multi-step and async workflows.
---

# State Management

**Use when:** choosing where a piece of state should live, fixing whole-tree re-renders caused by a wide context, sharing state across routes, or modelling async and multi-step workflows.
**Do not use when:** the "state" is actually server data — use the framework's data layer or `react-performance`; for form validation flow use `forms-validation`.

## Instructions

1. Classify before you store: ephemeral UI (popover open), URL state (filters, selected id, pagination), form draft, server state (entities), or genuine cross-route client state (theme, cart, feature flags).
2. Climb the escalation ladder and stop at the first rung that works: `useState` → nearest common parent → context → URL search params → external store → state machine.
3. Keep server data in a server cache (React Query/SWR, or RSC plus `cache()`), never mirrored into a global store.
4. Put shareable, back-button-safe state in the URL: read search params, write with the router, derive everything else.
5. Keep form drafts in the form library (`react-hook-form`, Vue `useForm`, SvelteKit form actions), never in a global store — drafts are per-instance.
6. Colocate state with the component that owns it; lift only when two siblings genuinely need it. Premature lifting is the root of prop drilling.
7. Subscribe narrowly: primitives in Zustand selectors, `useShallow` for multiple fields, `useSelector` with memoised selectors in Redux, and contexts split by update frequency.
8. Model workflows with illegal transitions (checkout, upload queue, wizard) as a discriminated union or XState v5 machine so impossible states cannot be expressed.
9. Never store derived values. Compute them in a selector; a stored copy goes stale the moment one write path forgets to update it.
10. Review the real action stream: in dev, log every dispatched action name so you can see what the store actually does during a flow.

## Patterns

Narrow subscriptions with Zustand selectors and shallow comparison:

```ts
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";

type CartState = { items: Record<string, { id: string; qty: number; priceCents: number }> };

export const useCart = create<CartState>(() => ({ items: {} }));

// Primitive selector: only this component re-renders
export function CartBadge() {
  const count = useCart((s) => Object.values(s.items).reduce((n, i) => n + i.qty, 0));
  return <span className="badge">{count}</span>;
}

// Multiple fields: useShallow stops a new object identity every render
export function CartSummary() {
  const { items, totalCents } = useCart(
    useShallow((s) => ({
      items: Object.values(s.items),
      totalCents: Object.values(s.items).reduce((n, i) => n + i.priceCents * i.qty, 0),
    })),
  );
  const format = new Intl.NumberFormat("en", { style: "currency", currency: "USD" });
  return <p>{items.length} items — {format.format(totalCents / 100)}</p>;
}
```

Splitting a context into a volatile value and a stable dispatcher:

```tsx
const ThemeStateCtx = createContext<{ theme: Theme }>(null!);
const ThemeActionsCtx = createContext<{ setTheme: (t: Theme) => void }>(null!);

function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem("theme") as Theme) ?? "system",
  );
  const actions = useMemo(() => ({ setTheme }), []); // stable forever
  return (
    <ThemeStateCtx value={{ theme }}>
      <ThemeActionsCtx value={actions}>{children}</ThemeActionsCtx>
    </ThemeStateCtx>
  );
}
```

State machine for a workflow where double-submit must be unrepresentable (XState v5):

```ts
import { setup, assign } from "xstate";

const checkout = setup({
  types: {
    context: {} as { orderId?: string; error?: string },
    events: {} as
      | { type: "SUBMIT" }
      | { type: "RESOLVE"; orderId: string }
      | { type: "REJECT"; error: string },
  },
}).createMachine({
  id: "checkout",
  initial: "idle",
  states: {
    idle: { on: { SUBMIT: "submitting" } },
    submitting: {
      on: {
        RESOLVE: { target: "confirmed", actions: assign({ orderId: ({ event }) => event.orderId }) },
        REJECT: { target: "failed", actions: assign({ error: ({ event }) => event.error }) },
      },
    },
    // SUBMIT is not handled here, so double-submit cannot be expressed
    failed: { on: { SUBMIT: "submitting" } },
    confirmed: { type: "final" },
  },
});
```

## Checklist

- [ ] Every stateful value is classified as UI / URL / form draft / server / client-global.
- [ ] Server data lives in one server cache and is not duplicated into a global store.
- [ ] Filters, pagination, and selected ids live in the URL and survive reload plus Back.
- [ ] Store subscriptions return primitives or shallow-compared slices.
- [ ] Contexts with frequently-changing state are split from stable dispatch contexts.
- [ ] No derived value is stored; selectors compute totals, counts, and visibility.
- [ ] Async or multi-step flows cannot represent an illegal transition.
- [ ] Sign-out and reset clear every persisted slice; nothing stale survives.

## Anti-patterns

**Mirroring server data into a global store.** An effect fetches, writes to Redux, and another component writes back — now two caches with independent invalidation and visible stale flashes. Fix: one server cache as the source of truth; keep only client-only UI state in the store.

**One mega-context.** A single `AppContext` holding theme, user, and cart re-renders every consumer on every keystroke, and `memo` does not help because context bypasses it. Fix: split by update frequency and consume through selectors; verify with the React Profiler's commit count.

**Storing derived state next to its inputs.** Keeping `filteredItems` beside `items` and `filter` means any missed update path ships a stale list. Fix: derive in a selector or `computed`; store only the inputs.