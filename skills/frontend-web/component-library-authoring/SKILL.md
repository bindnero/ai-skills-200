---
name: component-library-authoring
description: Authors reusable UI library components with typed props, controlled/uncontrolled parity, compound-part APIs, and Storybook plus accessibility coverage. Use when building or refactoring a design-system component, designing a Button/Dialog/Tabs public API, or shipping a component for multiple consuming apps.
---

# Component Library Authoring

**Use when:** building or refactoring a shared design-system component, deciding a component's public prop surface, or packaging components for several consuming apps.
**Do not use when:** the work is a one-off page section that will not be reused — use `html-semantics` and `css-architecture`; for the tokens behind the components use `design-tokens`.

## Instructions

1. Write the usage contract first: two or three real `<Button>` call sites in Storybook before the implementation. APIs designed in the abstract leak internals.
2. Keep the prop surface small and role-named (`variant`, `size`, `tone`), never appearance-named (`blue`, `big`, `shadow`). If a value cannot be a token, do not accept it as a prop.
3. Implement interactive components as polymorphic `asChild`/polymorphic elements with correct typing, so `Button` can render an `<a>` with identical styling.
4. Support controlled and uncontrolled usage (`value`/`defaultValue`, `open`/`defaultOpen`) through one internal hook; never force consumers into a single mode.
5. Merge consumer `className` through a `cn()` helper (`clsx` + `tailwind-merge`) so variant precedence stays predictable when overrides are added.
6. Bake accessibility in: manage focus, roving tabindex, `aria-*` wiring, Escape, and outside-click internally, and forward refs to the DOM node. Do not export them as props.
7. Compose parts as compound components (`Dialog.Title`, `Tabs.List`, `Menu.Item`) via a parent that provides context — not `renderHeader` callbacks that hand callers the internals.
8. Document every component: Storybook `args`, `argTypes` with controls, a11y addon set to `error`, and stories for loading, empty, error, disabled, and overflow states.
9. Enforce the contract in CI: Testing Library tests, `axe` per story, and a type-level test rendering each component with its documented args.
10. Version semantically with a changelog; breaking renames ship a deprecated alias that logs one warning, or a codemod.

## Patterns

Typed polymorphic base with variant merging:

```tsx
import { forwardRef } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

const button = cva(
  "inline-flex items-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-2 disabled:opacity-50",
  {
    variants: {
      tone: {
        primary: "bg-action-bg text-action-fg hover:bg-action-bg-hover",
        ghost: "bg-transparent text-fg hover:bg-surface-hover",
        danger: "bg-danger-bg text-danger-fg",
      },
      size: { sm: "h-8 px-3 text-sm", md: "h-10 px-4 text-sm", lg: "h-12 px-6 text-base" },
    },
    defaultVariants: { tone: "primary", size: "md" },
  },
);

export type ButtonProps = React.ComponentPropsWithoutRef<"button"> &
  VariantProps<typeof button> & { asChild?: boolean };

export const Button = forwardRef<HTMLElement, ButtonProps>(
  ({ asChild, className, tone, size, type, ...rest }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        // type defaults to button: a bare <button> inside a form submits it
        type={asChild ? undefined : (type ?? "button")}
        className={cn(button({ tone, size }), className)}
        {...rest}
      />
    );
  },
);
Button.displayName = "Button";
```

Compound parts through context, plus a controlled/uncontrolled hook for the value:

```tsx
type TabsCtx = { value: string; setValue: (v: string) => void; baseId: string };
const TabsContext = createContext<TabsCtx | null>(null);

function Tabs({ value, defaultValue, onValueChange, children }: TabsProps) {
  const [val, setVal] = useControllable(value, defaultValue ?? "", onValueChange);
  const baseId = useId();
  return (
    <TabsContext value={{ value: val, setValue: setVal, baseId }}>
      <div className="tabs">{children}</div>
    </TabsContext>
  );
}

function TabsTrigger({ value, children }: { value: string; children: ReactNode }) {
  const ctx = useTabsContext();
  const selected = ctx.value === value;
  return (
    <button
      role="tab"
      id={`${ctx.baseId}-tab-${value}`}
      aria-selected={selected}
      aria-controls={`${ctx.baseId}-panel-${value}`}
      tabIndex={selected ? 0 : -1} /* roving tabindex */
      onClick={() => ctx.setValue(value)}
    >
      {children}
    </button>
  );
}

Tabs.Trigger = TabsTrigger;
```

## Checklist

- [ ] Usage contract proven by real call sites in Storybook before implementation.
- [ ] Props are role-named and every visual value maps to a design token.
- [ ] `asChild` rendering is typed and the ref lands on the real DOM node.
- [ ] Controlled and uncontrolled modes both work and both have tests.
- [ ] Consumer `className` merged through the variant helper, never concatenated.
- [ ] Focus, `aria-*`, Escape, and outside-click handled internally rather than via props.
- [ ] Stories exist for loading, empty, error, disabled, and long-content states.
- [ ] `axe` passes in Storybook and the package type-checks with zero errors.

## Anti-patterns

**Appearance-named props** (`color="blue"`, `padding="lg"`). The API bakes in design decisions, every brand change becomes a new prop, and consumers start fighting the theme. Fix: role-named variants backed by tokens, with a documented escape hatch for true one-offs.

**Props that leak internals** (`renderHeader`, `headerAlign`). Callers rebuild the component's guts from outside, and every internal refactor is a breaking change. Fix: compound components plus slots, keeping behaviour owned by the library.

**A `<button>` that submits forms.** A design-system `Button` without an explicit default `type` submits the surrounding form every time it sits near an input. Fix: default `type` to `"button"` and only pass `"submit"` deliberately.

**Consumers patching styles with `!important`.** The library ships one specificity and apps pile on more, so upgrades become breaking. Fix: ship zero-specificity hooks (`:where()` variants, token variables) and forbid `!important` in the library's lint config.