# Raw HTML

## Script tags form an HTML block

<script>
Markdown *inside* this block is raw.
</script>

## A blank line does not end a script or style block

<script>
const before = 1;

const after = 2;
</script>

<style>
.leaf { color: green; }

.bed { color: brown; }
</style>

## Comments form an HTML block

<!-- a multiline
comment -->

## A blank line does not end a comment block

<!-- a comment opens here

and closes after a blank line -->

## Block-level tags form an HTML block

<section class="garden">
*Markdown is raw until the blank line for this block type.*
</section>

## A blank line ends a block-level tag block before its closing tag

<section class="garden">
Raw content of the block.

*This paragraph follows the block rather than belonging to it.*

</section>

<details>
<summary>Collapsible summary</summary>

*This paragraph sits between two block-level tag blocks.*

</details>

## Block-level tags may interrupt a paragraph

Paragraph text before a known block tag.
<section class="garden">
Raw content after the interruption.
</section>

## A closing tag alone begins a block

</section>
Raw content following a closing tag that opened the block.

## Attributes may span lines, omit quotation, and use single quotes

<section
  class=garden
  data-bed='north'>
*Raw content of a start tag spread across several lines.*
</section>

## CDATA declarations form an HTML block

<![CDATA[
<raw> & *Markdown-looking content*
]]>

## Processing instructions form an HTML block

<?garden
inspect="north"
?>

## Declarations form an HTML block

<!GARDEN
north bed declaration
>

## Complete custom tags form an HTML block

<garden-card data-bed="north">
*Raw until the blank line ends this type-seven block.*
</garden-card>

## Complete custom tags may not interrupt a paragraph

Paragraph text before a custom tag.
<garden-card data-bed="north">

## Tags may appear inside paragraph text

Text with <span class="leaf">raw *inline* HTML</span> after it.

An empty tag <br /> and a custom tag <garden-plot data-bed="north" /> remain raw.

## Comments and declarations may appear inline

Text <!-- comment --> then <?garden inspect?> and <!GARDEN note> and <![CDATA[raw <leaf>]]>.

## Mismatched inline tags remain raw

Text with <em>an opening tag and a foreign </strong> closing tag.

## Event-handler attributes and script content remain literal text

<div onclick="alert(1)">A handler attribute stays part of the raw source.</div>

An inline <img src=x onerror=alert(1) /> and a <script>alert(1)</script> span.

## Malformed tag-like text remains literal

< a> <33> <__> <tag bad*name=value> </tag attribute=value>
