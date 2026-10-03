name: Pull request

body:
  - type: checkboxes
    id: checks
    attributes:
      label: Checklist
      options:
        - label: `npm run check` passes (validator + catalog)
        - label: `npm run docs` run if I added or renamed a skill
        - label: Frontmatter has only `name` and `description`; `name` matches the folder
        - label: Description is third person, front-loads trigger keywords, and has a "Use when" clause
        - label: Body has all four sections in order: Instructions, Patterns, Checklist, Anti-patterns
        - label: Has a "Do not use when" line naming the adjacent skill
        - label: Code in Patterns is real and correct — no `...rest`, no TODOs, no invented APIs
  - type: textarea
    id: what
    attributes:
      label: What changed
      description: Which skill(s) and why.
    validations:
      required: true
  - type: textarea
    id: renamed
    attributes:
      label: Renamed or moved any skill?
      description: If you changed a `name`, note the old and new so install commands in issues stay accurate.