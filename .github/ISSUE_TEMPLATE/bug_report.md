name: Bug report

description: Something in a skill or in the tooling is wrong.
labels: bug
body:
  - type: textarea
    id: what-happened
    attributes:
      label: What happened
      description: The skill gave wrong guidance, or the installer/catalog did something unexpected.
    validations:
      required: true
  - type: textarea
    id: reproduce
    attributes:
      label: Reproduction
      description: Commands, request text, and what you expected instead.
    validations:
      required: true
  - type: input
    id: skill
    attributes:
      label: Which skill?
      description: Skill name or category, and a link if you have one.
    validations:
      required: true
  - type: dropdown
    id: kind
    attributes:
      label: What kind of issue?
      options:
        - Incorrect or outdated technical content
        - Description doesn't trigger (skill never loads)
        - Wrong skill triggers (overlaps another)
        - Installer / tooling bug
        - Docs or catalog out of date
        - Other
    validations:
      required: true
  - type: textarea
    id: suggested
    attributes:
      label: Suggested fix
      description: If you know the correction, spell it out — exact replacement text is ideal.