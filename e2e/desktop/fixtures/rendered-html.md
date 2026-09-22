Before

<div>Self-contained <strong>safe HTML</strong>.</div>

<section>
Multiline safe HTML.
</section>

<div style="position:fixed">Forbidden style</div>

<div><svg><text>Forbidden namespace</text></svg></div>

<div><img src="https://example.com/tracker.png" onerror="window.rawHtmlExecuted=true"></div>

<div><!-- A sanitizer would remove this comment. --></div>

After
