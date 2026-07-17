# Raw HTML

## Script tags form an HTML block

<script>
Markdown *inside* this block is raw.
</script>

## Comments form an HTML block

<!-- a multiline
comment -->

## Block-level tags form an HTML block

<section class="garden">
*Markdown is raw until the blank line for this block type.*
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

## Tags may appear inside paragraph text

Text with <span class="leaf">raw *inline* HTML</span> after it.

An empty tag <br /> and a custom tag <garden-plot data-bed="north" /> remain raw.

## Comments and declarations may appear inline

Text <!-- comment --> then <?garden inspect?> and <!GARDEN note> and <![CDATA[raw <leaf>]]>.

## Malformed tag-like text remains literal

< a> <33> <__> <tag bad*name=value> </tag attribute=value>
