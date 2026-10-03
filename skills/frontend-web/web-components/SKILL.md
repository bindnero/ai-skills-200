---
name: web-components
description: Builds platform custom elements with Shadow DOM, constructable stylesheets, slots, form participation via `ElementInternals`, and Lit. Use when shipping framework-agnostic widgets, embedding a design-system component in a non-React host, or migrating a legacy web component.
---

# Web Components

**Use when:** shipping framework-agnostic widgets, embedding a design-system component inside a non-framework host, adding form participation to a custom element, or maintaining an existing Shadow DOM codebase.
**Do not use when:** the entire app is one framework — components written in that framework are smaller and better integrated; for framework component design use `component-library-authoring`.

## Instructions

1. Use Shadow DOM for style encapsulation and keep the light DOM as content only. Adopt `:host` for the host element and `:host([attr])` for host states instead of reaching for `::part`.
2. Attach styles with a constructable stylesheet (`new CSSStyleSheet()` + `replaceSync`) shared across every instance, so 1,000 elements share one parsed stylesheet.
3. Guard `customElements.define` — a duplicate definition throws and breaks the page. Check `customElements.get(name)` first.
4. Use slots for composition and listen to `slotchange` to react to assigned nodes; never read `children` of the host to find slotted content.
5. Keep attributes as the serialisable public API (strings, numbers, booleans) and observe only the attributes you consume, with `observedAttributes` plus `attributeChangedCallback`.
6. Reflect state to attributes only when the state must survive serialisation or be targetable in CSS — otherwise leave it as a property to avoid attribute-parsing churn.
7. Make interactive elements form-associated with `static formAssociated = true` and `this.attachInternals()`, so validation and submission work without a framework form library.
8. Choose Lit for anything with real state and rendering. Vanilla custom elements are appropriate for self-contained widgets under roughly 100 lines of logic.
9. Support Declarative Shadow DOM in the HTML you emit (`<template shadowrootmode="open">`) so no upgrade flash occurs for server-rendered markup.
10. Test in the platform: unit-test the element with `@web/test-runner` plus a11y checks, and verify in Safari because it lacks some newer APIs.

## Patterns

Vanilla element with shared styles, slots, and form participation:
```css
/* quantity-input.css — parsed once, shared by every instance */
:host { display: inline-flex; gap: 0.25rem; align-items: center; }
button { inline-size: 2rem; block-size: 2rem; }
```
```js
// quantity-input.js
import css from "./quantity-input.css?inline";

const sheet = new CSSStyleSheet();
sheet.replaceSync(css);

if (!customElements.get("quantity-input")) {
  class QuantityInput extends HTMLElement {
    static formAssociated = true;
    static observedAttributes = ["value", "max"];
    #internals = this.attachInternals();

    connectedCallback() {
      if (!this.shadowRoot) this.attachShadow({ mode: "open" });
      this.shadowRoot.adoptedStyleSheets = [sheet]; // shared by every instance
      this.#internals.setFormValue(String(this.#current));
      this.#render();
    }

    attributeChangedCallback() { if (this.isConnected) this.#render(); }

    get value() { return Number(this.getAttribute("value") ?? 1); }
    set value(v) { this.setAttribute("value", String(v)); }

    get #current() { return Math.min(Math.max(this.value, 1), Number(this.getAttribute("max") ?? 99)); }

    #render() {
      this.shadowRoot.innerHTML = `
        <button type="button" aria-label="Decrease quantity">−</button>
        <input name="qty" type="number" min="1" max="${this.getAttribute("max") ?? 99}"
               value="${this.#current}" aria-label="Quantity">
        <button type="button" aria-label="Increase quantity">+</button>
        <slot name="unit"></slot>`;
    }
  }
  customElements.define("quantity-input", QuantityInput);
}
```

Declarative Shadow DOM for server-rendered markup, avoiding an upgrade flash:
```html
<form>
  <template shadowrootmode="open">
    <style>input{font:inherit}</style>
    <input name="qty" type="number" min="1" max="10" value="1" aria-label="Quantity">
  </template>
  <quantity-input name="qty" value="3" max="10"></quantity-input>
  <span slot="unit">units</span>
</form>
```

Lit component for elements with real state:
```ts
import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";

@customElement("order-summary")
export class OrderSummary extends LitElement {
  static styles = css`:host { display: block; } .total { font-weight: 600; }`;
  @property({ type: Number }) subtotalCents = 0;
  @property({ type: String }) currency = "USD";
  @state() private expanded = false;

  private get total() {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: this.currency }).format(
      this.subtotalCents / 100,
    );
  }

  render() {
    return html`
      <button aria-expanded=${this.expanded} @click=${() => (this.expanded = !this.expanded)}>Details</button>
      ${this.expanded ? html`<p class="total">${this.total}</p>` : null}
      <slot></slot>`;
  }
}

declare global {
  interface HTMLElementTagNameMap { "order-summary": OrderSummary }
}
```

## Checklist

- [ ] `customElements.define` is guarded with `customElements.get`.
- [ ] Styles live in one constructable stylesheet shared by all instances, not injected per element.
- [ ] All user-provided content arrives through slots; `slotchange` drives layout reactions.
- [ ] Only consumed attributes are listed in `observedAttributes`.
- [ ] Form-associated elements set `formAssociated`, use `attachInternals()`, and call `setFormValue`.
- [ ] Server-rendered markup uses `<template shadowrootmode="open">` to avoid a flash.
- [ ] `HTMLElementTagNameMap` is augmented, and tests run on `@web/test-runner` including Safari.
## Anti-patterns

**Injecting a `<style>` tag per instance.** 1,000 elements means 1,000 style parses and a large memory cost. Fix: one `CSSStyleSheet` in `replaceSync`, assigned through `adoptedStyleSheets`.

**Reflecting every state change to an attribute.** `attributeChangedCallback` fires for each write, forcing string parsing on every update. Fix: keep fast-changing state as a property and reflect only serialisable or CSS-targetable state.

**Reading `this.children` to find slotted content.** Light DOM children are the consumer's nodes, not your layout, and the timing is wrong before assignment. Fix: `<slot>` plus a `slotchange` listener.