---
name: vue-patterns
description: Applies Vue 3 Composition API conventions — `script setup`, `defineModel`, typed composables, `provide`/`inject` with injection keys, and Pinia setup stores — while avoiding reactivity-destroying destructuring. Use when writing or refactoring `.vue` SFCs, extracting logic into composables, or fixing stale values and re-render churn in Vue apps.
---

# Vue Patterns

**Use when:** authoring or refactoring Vue 3 single-file components, extracting shared logic into composables, wiring `provide`/`inject`, or debugging values that render stale.
**Do not use when:** the project is Nuxt-specific server rendering, Pinia persistence design, or Nuxt data fetching — those belong to the Nuxt/backend skills; for framework-agnostic markup structure use `html-semantics`.

## Instructions

1. Use `<script setup lang="ts">` with `defineProps`/`defineEmits` as compiler macros; add `defineOptions({ name, inheritAttrs })` when the component needs a name or disables attribute inheritance.
2. Declare props with a type-only object and `withDefaults` for defaults; never use the runtime array/constructor syntax, which has no type checking.
3. Use `defineModel()` for two-way bindings so `v-model` works without an explicit `modelValue` prop plus `update:modelValue` emit pair.
4. Never destructure `reactive()` objects — destructuring copies the current value and kills reactivity. Use `toRefs`, or prefer `ref()`.
5. Derive with `computed`, not `watch` plus a ref you must keep in sync; reserve `watch` for side effects (fetch, storage, timers) with `onWatcherCleanup` for cancellation.
6. Extract anything reused into a composable named `useThing`; call lifecycle hooks only during `setup` so Vue can bind them to the instance.
7. Type `provide`/`inject` with a symbol key and explicit generic, and provide read-only state where consumers must not mutate it.
8. Use Pinia setup stores: `defineStore(id, () => ({...}))` with refs as state and functions as actions; destructure with `storeToRefs` so reactivity survives.
9. Key lists with stable ids, not array indices; use `v-memo` only after measuring a genuinely large list.
10. In Vue 3.5+, use `useTemplateRef('name')` instead of a same-named `ref(null)` kept in sync by hand.

## Patterns

Component with typed props, models, and a template ref:
```vue
<script setup lang="ts">
import { computed, useTemplateRef } from "vue";

defineOptions({ name: "LineItemRow", inheritAttrs: false });
const props = withDefaults(defineProps<{ line: CartLine; compact?: boolean }>(), { compact: false });
const emit = defineEmits<{ remove: [id: string] }>();
const quantity = defineModel<number>("quantity", { required: true });
const lineTotal = computed(() => props.line.unitPriceCents * quantity.value);
</script>

<template>
  <li ref="row" :class="{ 'is-compact': compact }" v-bind="$attrs">
    <span>{{ line.title }}</span>
    <input v-model.number="quantity" type="number" min="1" :aria-label="`Quantity for ${line.title}`" />
    <output>{{ (lineTotal / 100).toFixed(2) }}</output>
    <button type="button" @click="emit('remove', line.id)">Remove</button>
  </li>
</template>
```

Reactivity traps and the correct escapes:
```ts
const state = reactive({ query: "", page: 1 });
// BROKEN: destructuring copies the value; the template renders stale data forever
const { query } = state;
// CORRECT: toRefs keeps the link
const { query: queryRef } = toRefs(state);

// Derivation, not mirroring
const results = computed(() => search(state.query, state.page));

// watch is for side effects, and cancels its own stale work
watch(
  () => state.query,
  async (q) => {
    const controller = new AbortController();
    onWatcherCleanup(() => controller.abort());
    results.value = await search(q, { signal: controller.signal });
  },
);
```
Composable with typed provide/inject, guarded for missing providers:
```ts
// composables/useFilters.ts
export interface FiltersContext {
  query: Ref<string>;
  page: Ref<number>;
  isFiltered: ComputedRef<boolean>;
}
export const FILTERS: InjectionKey<FiltersContext> = Symbol("filters");

export function provideFilters() {
  const query = ref("");
  const page = ref(1);
  provide(FILTERS, { query, page, isFiltered: computed(() => query.value.length > 0 || page.value > 1) });
}

export function useFilters() {
  const ctx = inject(FILTERS);
  if (!ctx) throw new Error("useFilters() requires provideFilters() in an ancestor");
  return ctx;
}
```

Pinia setup store and safe destructuring:
```ts
// stores/cart.ts
export const useCartStore = defineStore("cart", () => {
  const items = ref<{ id: string; qty: number }[]>([]);
  const itemCount = computed(() => items.value.reduce((n, i) => n + i.qty, 0));
  function add(id: string, qty = 1) {
    const found = items.value.find((i) => i.id === id);
    if (found) found.qty += qty;
    else items.value.push({ id, qty });
  }
  return { items, itemCount, add };
});

// In a component: state via storeToRefs, actions stay bound
const { itemCount } = storeToRefs(useCartStore());
const { add } = useCartStore();
```

## Checklist

- [ ] Every SFC uses `<script setup lang="ts">` with type-only `defineProps`.
- [ ] Two-way bindings use `defineModel`, not hand-rolled `modelValue` prop/emit pairs.
- [ ] No destructuring of `reactive()` objects without `toRefs`.
- [ ] Derived data uses `computed`; `watch` handles side effects with `onWatcherCleanup`.
- [ ] Composables are named `use*`, called during `setup`, and return refs rather than raw values.
- [ ] `provide`/`inject` uses a typed `InjectionKey` and throws on a missing provider.
- [ ] Pinia stores are setup-style, with `storeToRefs` used before destructuring.
- [ ] `v-for` keys are stable ids; `v-memo` appears only where profiling justified it.

## Anti-patterns

**Destructuring `reactive()`.** `const { query } = reactive({ query: "" })` yields a snapshot; assigning to `query` never touches the source and the template renders the old value forever. Fix: `ref()` for standalone state, `toRefs()` when destructuring a `reactive` object.

**Mirroring state with `watch` into a second ref.** Two variables hold the same fact, so every new write path can leave them inconsistent. Fix: `computed` for derivation; `watch` only for effects that leave Vue (fetch, storage, analytics).

**Implicit `modelValue`/`update:modelValue` pairs.** Hand-written emit lists drift from the prop names and break `v-model` typing. Fix: `defineModel<T>('name', { required: true })` and let the compiler generate both halves.

**Reactive props objects mutated in place.** Mutating a prop mutates the parent's state, so behaviour depends on where the component is mounted. Fix: emit intent (`update:selectedId`) or copy into local state; treat props as read-only.