---
name: voice-and-tone
description: Defines product voice and tone, builds a terminology glossary, and writes UI microcopy for buttons, confirmations, and status messages consistently across surfaces. Use when writing interface copy, resolving conflicting terminology, or aligning marketing language with in-product voice.
---

# Voice and Tone

**Use when:** writing or reviewing UI microcopy, when the same concept is named three different ways across screens, or when product copy does not match the brand voice.
**Do not use when:** the wording of a validation message is the specific problem, which is `error-message-design`.

## Instructions

1. Define voice as a small set of traits with a do and a do-not for each, then define tone as the variation applied per situation — celebratory after a win, plain during a failure, calm during a destructive action.
2. Build a terminology glossary before writing screens. Pick one word per concept and forbid the synonyms: "delete" never becomes "remove" or "unlink" in the same product.
3. Write buttons as verb-first labels describing the outcome: "Save changes", "Send invite", "Export CSV". Never "OK", "Submit", "Yes" on an action whose effect is unclear.
4. Write to the user's vocabulary, not the system's. If the database says `subscription_id`, the button says "Cancel plan", not "Terminate subscription ID".
5. Vary sentence length deliberately. Short for errors and confirmations; longer for guidance that requires an explanation.
6. Use second person and active voice. "You have 3 invoices due" beats "3 invoices are due to you"; "We saved your changes" beats "Your changes were saved".
7. Be specific about consequences. "Delete project" and "Delete project and 4 deployments" are different buttons and must read differently.
8. Respect the reader's state. During an error, drop playfulness entirely; during routine success, do not congratulate.
9. Handle numbers, dates, and units in one documented format per context, with localization in mind — never hardcode "mm/dd/yyyy" into a string.
10. Review copy alongside support and content teams, keep it in version control as structured content, and re-read it after every redesign of the surrounding screen.

## Patterns

Voice and tone matrix:

```markdown
TRAIT       WE ARE                                   WE ARE NOT
clear       "Your export is ready."                  "The operation completed."
direct      "Delete 4 deployments?"                  "This action is irreversible."
human       "Nothing to review today."                "0 items pending."
calm        "We couldn't save that. Try again."      "Oops! Something went wrong."
brief       "Invalid date."                          "The date field you entered
                                                    does not conform to the
                                                    expected format."

TONE BY SITUATION
  success after a meaningful action   confirm concretely, no celebration
  routine background sync             no message at all
  error                              plain, no humour, name the cause
  destructive confirm                state exactly what is lost, offer undo
  first-run                          encouraging, still concrete
```

Termology glossary, enforced:

```markdown
CONCEPT            USE            NEVER USE            NOTE
user's records     projects       workspaces, tenants  domain term
delete             Delete         Remove, Unlink, Purge Delete has one meaning
cancel subscription Cancel plan    End plan, Unsubscribe Billing is a plan
invite             Invite         Add user, Grant      the actor is a person
sign out           Sign out       Logout, Exit app     never "exit"
free tier          Free plan      Trial, Basic, Lite   the commercial name

ERROR if a pull request introduces "Remove" in a delete flow -> revert to "Delete".
```

Button label library:

```markdown
ACTION              LABEL                     NOT THIS
submit settings     Save changes              OK, Submit
remove a member     Remove Dana from Acme     Delete user
confirm destruction  Delete 4 deployments      Are you sure?  -> Confirm "Delete"
export               Export CSV (12,400 rows) Export
close overlay        Close                     X, Done
start over           Start over                Reset, Clear all
retry                Try again                 Retry (fine) / Refresh (wrong verb)
```

Structured copy with placeholders and plurals:

```json
{
  "invoice.dueSoon": {
    "one": "{count} invoice is due tomorrow.",
    "other": "{count} invoices are due tomorrow."
  },
  "delete.projects.confirmTitle": {
    "one": "Delete {name}?",
    "other": "Delete {name} and {count} deployments?"
  },
  "export.csv": "Export CSV ({count} rows)",
  "date.due": { "formats": { "short": "MMM d", "long": "MMMM d, yyyy" } }
}
```

Review checklist to run per screen:

```markdown
[ ] Every object and action uses the glossary term, no synonyms
[ ] Buttons are verb-first and name the outcome, no bare "OK"
[ ] Destructive copy states the count of what is lost
[ ] Error copy names the cause and the next step, no humour
[ ] Success copy confirms the concrete result, no exclamation marks
[ ] Second person, active voice, no passive construction
[ ] Numbers, dates, and units use the documented formats
[ ] Sentence length varies: short for errors, longer for guidance
[ ] Strings live in the content file with plurals and interpolation keys
```

## Checklist

- [ ] Voice traits with explicit do and do-not, plus tone defined per situation
- [ ] Terminology glossary exists and synonyms are listed as forbidden
- [ ] Every button is verb-first and names its outcome
- [ ] Product copy uses user vocabulary, never internal object names
- [ ] Destructive copy states the exact consequence and count
- [ ] Errors are plain and humourless; successes confirm a concrete result
- [ ] Second person and active voice, with date, number, and unit formats externalized
- [ ] Strings stored as structured content with plurals, in version control

## Anti-patterns

**"OK" and "Submit".** Buttons whose labels do not say what happens. Users hover to find out, and screen reader users get "button" with no purpose. Fix: verb-first labels naming the outcome, and a specific label on destructive actions.

**Synonym drift.** "Delete" in billing, "Remove" in projects, "Unlink" in integrations. Users hesitate over a mild action and fire a severe one. Fix: one glossary term per concept, enforced in review with a lintable check.

**Confetti copy.** "Awesome! 🎉 You did it!" on a routine save. Wrong register for a settings page, and the noise trains people to ignore confirmations. Fix: confirm the concrete result in one short sentence.

**Internal jargon in the UI.** "Session token expired" and "Sync failed with code 4012". The user cannot act on either. Fix: describe the situation and the next action in the user's terms, and keep the code in the support logs.

**Tone set once and frozen.** Error copy still says "Oops!" two years after the tone matrix forbade it. Fix: keep copy in version control as structured content, review it whenever a screen is redesigned, and re-run the checklist per screen.