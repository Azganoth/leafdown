# Admonitions

## GitHub-style alerts

> [!NOTE]
> A note alert.

> [!TIP]
> A tip alert.

> [!IMPORTANT]
> An important alert.

> [!WARNING]
> A warning alert.

> [!CAUTION]
> A caution alert.

## MkDocs-style admonitions

!!! note "Garden note"
    Indented admonition content with **Markdown**.

??? warning "Collapsible warning"
    Collapsible admonition content.

???+ tip "Expanded tip"
    Expanded admonition content with a [link](../practical/field-report.md).

!!! info ""
    Untitled admonition content.

## Docusaurus admonitions

:::note[Garden **note**]
An admonition with an authored bracket title and an editable list:

- first reminder
- second reminder
:::

## VitePress custom containers

::: warning
Fenced warning content.
:::

::: details Read the example
```md
::: tip inside code remains code
```
:::

## Distinct colon spellings

:::warning[Docusaurus title]
The type touches the fence, and the title uses brackets.
:::

::: warning VitePress title
The type follows a space, and the title is plain text.
:::
