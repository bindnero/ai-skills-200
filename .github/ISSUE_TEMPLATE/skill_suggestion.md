name: Skill suggestion

description: Propose a new skill.
labels: enhancement
body:
  - type: textarea
    id: problem
    attributes:
      label: What problem does it solve?
      description: Describe the task, not the topic. What would someone be doing when they need this?
    validations:
      required: true
  - type: textarea
    id: triggers
    attributes:
      label: What should trigger it?
      description: Three example user requests, phrased naturally. These become the basis of the description.
      placeholder: |
        "add a sitemap for a Next.js site"
        "our LCP is terrible on the homepage"
        "set up step-up auth for payouts"
    validations:
      required: true
  - type: input
    id: category
    attributes:
      label: Category
      placeholder: seo, frontend-web, backend-api, uiux-design, devops-cloud, testing-quality, security, ai-agents
    validations:
      required: true
  - type: textarea
    id: boundary
    attributes:
      label: Which existing skill owns the neighbouring case?
      description: Every skill needs a "Do not use when". Name the skill that should win instead.
    validations:
      required: true
  - type: checkboxes
    id: duplicate
    attributes:
      label: Before submitting
      options:
        - label: I searched the catalog and this isn't already covered.