# Agent skills

Portable skills for AI agents working with ngdpbase sites. Each folder is one skill in the Agent Skills layout: a `SKILL.md` with a `name` and `description` in its frontmatter, then plain instructions.

- [ncm-converter](ncm-converter/SKILL.md): turn content from any source into an NCM page file ([#1475](https://github.com/jwilleke/ngdpbase/issues/1475)).

## Using a skill

- __claude.ai:__ zip the skill's folder (`cd skills && zip -r ncm-converter.zip ncm-converter`) and upload the zip under Settings → Capabilities → Skills.
- __Any other agent:__ give it the contents of `SKILL.md`, as a file or pasted into the conversation. It is plain Markdown and needs no tools.

## Keeping a skill true

The examples in `ncm-converter/SKILL.md` are checked by `src/converters/ncm/__tests__/ncmConverterSkill.test.ts`: each must pass the save-time content checks and come through the NCM funnel unchanged. When the code changes what NCM is, that test fails until the skill is updated.
