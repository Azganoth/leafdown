# Tag Filter Boundaries

## Allowed tags remain raw HTML

<strong>allowed raw HTML</strong> <em>also allowed</em>

## Disallowed tags are filtered

<title>title</title>
<textarea>textarea</textarea>
<style>style</style>
<xmp>xmp</xmp>
<iframe>iframe</iframe>
<noembed>noembed</noembed>
<noframes>noframes</noframes>
<script>script</script>

## Tag-name matching is case-insensitive

<TiTlE>mixed-case disallowed tag is filtered</TiTlE>

## Plaintext is filtered

<plaintext>this final case must not consume anything after it</plaintext>
