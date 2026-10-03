---
name: form-ux-patterns
description: Applies form patterns including correct input types and autocomplete tokens, persistent labels, inline validation on blur, input masking, and accessible error association. Use when building or fixing a form, reducing form abandonment, or adding autofill and password manager support.
---

# Form UX Patterns

**Use when:** building or repairing a form, when users abandon before submitting, or when a form does not work with autofill and password managers.
**Do not use when:** only the error wording is wrong, which is `error-message-design`, or the problem is how many fields exist, which is `cognitive-load-reduction`.

## Instructions

1. Give every input a persistent visible `<label>` with a matching `for`/`id`. Placeholder text disappears exactly when it is needed, and a placeholder-only field fails 1.3.1 and 3.3.2.
2. Use the correct `type` so the platform supplies the right keyboard: `email`, `tel`, `url`, `number`, `date`, `time`, `color`, `search`. Use `inputmode` and `pattern` on `type="text"` when no semantic type fits.
3. Add `autocomplete` tokens so browser and password manager autofill works: `name`, `email`, `tel`, `street-address`, `organization`, `postal-code`, `country`, `cc-number`, `one-time-code`. This is a conversion and accessibility feature, not a nicety.
4. Order fields the way people think, and put the format they already know first — card number, expiry, CVC together; address fields in postal order for the target locale.
5. Show the format requirement before the field, not in the error after a failed submit. State it as an example, not a rule: "MM/DD/YYYY".
6. Validate format on blur and completeness on submit. Never validate mid-keystroke; it produces false errors while someone types.
7. Handle input masking in a way that preserves the real value: keep the underlying value unmasked, format for display, and make Backspace and paste behave. Never restrict input to a numeric keypad when paste must work.
8. Mark required fields with `required` plus a visible indicator, and state requirements in text rather than relying on an asterisk legend.
9. Set explicit `autocomplete` off only when genuinely harmful (one-time-code replacement), never to defeat a manager the user relies on.
10. Test every form with keyboard only, at 200% zoom, with autofill, with a password manager, and with the longest plausible values in every field.

## Patterns

Correct types, autocomplete, and masking:

```html
<form novalidate>
  <div class="field">
    <label for="email">Work email <span aria-hidden="true">*</span></label>
    <input id="email" name="email" type="email" autocomplete="email"
           inputmode="email" required aria-describedby="email-hint">
    <p id="email-hint" class="hint">We'll send the invite here.</p>
  </div>

  <div class="field">
    <label for="phone">Mobile number</label>
    <!-- real value stays in .value; only the display is formatted -->
    <input id="phone" name="phone" type="tel" autocomplete="tel"
           inputmode="tel" placeholder="(555) 000-0000"
           aria-describedby="phone-hint">
    <p id="phone-hint" class="hint">Optional. Used only for delivery updates.</p>
  </div>

  <div class="field-group" role="group" aria-labelledby="cc-label">
    <span id="cc-label">Card details</span>
    <input name="ccnumber" autocomplete="cc-number" inputmode="numeric"
           aria-label="Card number" placeholder="1234 5678 9012 3456" required>
    <input name="ccexp" autocomplete="cc-exp" inputmode="numeric"
           aria-label="Expiry month and year" placeholder="MM/YY" required>
    <input name="cvc" autocomplete="cc-csc" inputmode="numeric"
           aria-label="Security code" placeholder="CVC" required>
  </div>

  <label>
    <input type="checkbox" name="newsletter" value="yes">
    Send me product updates (about 2 emails a month)
  </label>

  <button type="submit" class="btn btn--primary">Create account</button>
</form>
```

Masking that keeps the value clean:

```js
const digits = (s) => s.replace(/\D/g, '');
const cc = document.querySelector('[name="ccnumber"]');
cc.addEventListener('input', () => {
  const v = digits(cc.value).slice(0, 16);
  const at = cc.value.length > 0 && cc.selectionStart === 0;   // typing at front
  cc.value = v.replace(/(.{4})/g, '$1 ').trim();
  if (at) cc.setSelectionRange(cc.value.length, cc.value.length);
});
// cc.value carries the masked string, cc.dataset.value carries digits for the API
cc.addEventListener('change', () => { cc.dataset.value = digits(cc.value); });
```

Blur validation with association, never mid-keystroke:

```js
const pattern = /^\d{3}-\d{2}-\d{4}$/;
field.addEventListener('blur', () => {
  const bad = field.value !== '' && !pattern.test(field.value);
  error.textContent = bad ? 'Enter the EIN as 12-3456789.' : '';
  field.setAttribute('aria-invalid', String(bad));
  field.setAttribute('aria-describedby', bad ? `${field.id}-error` : `${field.id}-hint`);
});
```

## Checklist

- [ ] Every input has a persistent visible label with matching `for`/`id`
- [ ] Semantic `type` and `inputmode` used so the correct keyboard appears
- [ ] `autocomplete` tokens present for name, email, address, and payment fields
- [ ] Fields ordered by user expectation, with related fields grouped by `fieldset`/`legend`
- [ ] Format requirement shown as an example before input, validated on blur; completeness on submit; input never reset on error
- [ ] Masking preserves the underlying value, and paste and Backspace work
- [ ] Required state marked with `required` plus visible text, not an unexplained asterisk
- [ ] Tested keyboard-only, at 200% zoom, with autofill, a password manager, and the longest values

## Anti-patterns

**Placeholder as label.** The field looks self-explanatory until it is empty after one keystroke, and screen readers report nothing useful. Fix: always a visible label; use placeholders for format examples only.

**Blocking autofill.** `autocomplete="off"` on name and email, or a custom field that defeats the password manager. Users retype everything and sometimes enter the wrong password into the wrong box. Fix: standard `autocomplete` tokens, and reserve `autocomplete="one-time-code"` for code fields only.

**Validating every keystroke.** An error appears while someone is still typing the first character. Fix: format validation on blur, completeness on submit.

**Numeric keypad blocking paste.** `onkeypress` filtering to digits destroys pasted values and breaks mobile paste entirely. Fix: sanitize on input rather than on keypress, and never filter keystrokes — filter the resulting value.

**Destroying input on validation.** Clearing a long address field after one invalid character, or resetting a collapsed section containing an error so submit fails silently. Fix: never reset the value; only add or remove validation state, and reveal any collapsed section that holds an error.