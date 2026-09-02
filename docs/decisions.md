# Decisions

## Product Decisions

### Markdown files remain the source of truth

**Decision:** Saved documents remain ordinary Markdown files on disk.

**Rationale:** Operate on standard files and directories directly, avoiding a proprietary database or storage wrapper.

**Consequences:**

- The editor may use an internal model while a document is open.
- Save operations serialize back to standard Markdown.
- File workflows remain compatible with external editor tools.

### Preserve the form a file was written in

**Decision:** A save writes a file back in the form it was authored in. Three properties are settled in that order, and only the last is a judgment. Content, meaning a node or a character the document would gain or lose, is never given up for form. Closure, meaning that the file the editor writes reloads as the document that wrote it, is a defect wherever it fails, repaired either by writing the authored form or by not writing the bytes at all. Form, meaning a spelling that every Markdown reader and the editor's own parser read identically, is preserved wherever a node or a mark can carry it and it survives an edit to the content it decorates, and is normalized where nothing owns it or the content invalidates it. This replaces the earlier direction to normalize generated Markdown to an application default style, which [issue #251](https://github.com/Azganoth/leafdown/issues/251) has retired class by class.

**Rationale:** The earlier direction was measured in [issue #135](https://github.com/Azganoth/leafdown/issues/135) as rewriting 12 of the 16 scoped corpus files on first open. The file on disk is the only copy Leafdown keeps, so a rewrite the author did not ask for is a diff they have to account for wherever the file is versioned, and it arrives on the first save rather than on an edit they can point at. The three properties rank rather than compete: content and closure are correctness, and form is the only one where two answers are both defensible. Ordering them keeps a form argument from being spent on a defect, and keeps a defect from being settled as a matter of taste. The ownership test is not new direction but the one the record reached independently in the authored autolink form, the character reference, and the thematic break run, each of which keeps an authored spelling and gives way to a canonical one where the file would not read back the same.

**Consequences:**

- A form change is judged by everything it forces, not by the local difference it names. A tilde code fence rewritten to backticks cannot carry a backtick in its info string, so normalizing the fence character also rewrites the info string into a character reference the author did not write, which is a second authored form lost to the first. The file still reloads as the same document, so the cost is form rather than content, and the class is weighed on the whole propagation rather than on the fence alone.
- Whitespace at a line edge the parser trims is not written at all, because no spelling of it reloads. Whitespace no parse trims is content and is written back as it was read.
- Every preserved form carries a canonical fallback rather than a preference. A bare URL falls back to angle brackets where a neighbour would hide it, a character reference degrades to the character it names once its recorded source no longer matches the text, and a thematic break gives way to `***` where its run would read as a heading underline or merge with its list item's bullet. A form whose fallback is not known is not preserved until it is.
- A table's cell padding, delimiter row width, and alignment padding are normalized, which is the class [issue #323](https://github.com/Azganoth/leafdown/issues/323) raises and this decision answers. No node owns a layout computed across a column, and a keystroke in any cell invalidates it, which is what separates it from every other form under [issue #251](https://github.com/Azganoth/leafdown/issues/251): those survive an edit to the content they decorate, and a column width is a function of it. `corpus/gfm/tables.md` therefore cannot reach byte identity, and the target is identity for the files whose forms a node can hold.
- A construct the editor creates writes a defined default form, and so does one whose authored form a fallback withdraws.
- Two constructs that mean the same thing are written by one rule. A strikethrough wrapping a link keeps its wrapper outside the link because bold and italic already do.
- A form is normalized on cost only where both spellings are interchangeable to a reader, and the cost is recorded as such so it can be revisited when it changes. A form nothing can own is not revisitable on those terms: the nesting order of two marks is lost because ProseMirror holds marks as a set.
- Output-formatting customization remains deferred. Preservation is not a formatter, and a document whose form the editor holds no record of is written in the serializer's own.

### No vault or workspace model

**Decision:** Opening a folder does not create a vault, workspace, import process, database, or metadata files in that folder.

**Rationale:** Leafdown is designed as a document-centric editor rather than a personal knowledge management system with custom workspace setups.

**Consequences:**

- Existing folder structures remain unmodified.
- Application metadata is stored externally from the opened folders.
- Folder workflows execute without initialization steps.

### Always folder-aware

**Decision:** Opening a folder uses it as the current folder context. Opening a file uses its parent folder as the current folder context only when no folder context is active. Once a folder context exists, it remains pinned until changed by an explicit folder action.

**Rationale:** Keeps folder-aware workflows available while preventing the article navigator from unexpectedly collapsing to nested or unrelated document parent folders.

**Consequences:**

- The sidebar matches the pinned folder context, not necessarily the active document's parent folder.
- Opening a single file scans its parent folder context only as a bootstrap path when no folder context is active.
- Opening Markdown documents outside the current folder context does not switch or prompt for a folder-context change.
- Untitled documents associate with the active folder context before saving.

### Use one hybrid document surface

**Decision:** The default document surface is one active hybrid WYSIWYG Markdown editor, without a permanent source/preview split or separate read/edit modes.

**Rationale:** A unified surface provides editing availability without the friction of explicit mode switching.

**Consequences:**

- The document surface supports both reading and editing workflows.
- Syntax markers display contextually based on the caret position.
- Source-only workflows cannot rely on a permanent second pane.
- A raw Markdown view, if implemented, is an explicit secondary view rather than the default surface.

### Treat marker presentation as object-specific

**Decision:** Leafdown chooses editable markers, subtle markers, persistent markers, or visual object affordances per Markdown object instead of applying one syntax-reveal rule to every object.

**Rationale:** Milkdown already provides structural editing for many block objects, while inline and source-oriented objects still benefit from local raw Markdown editing.

**Consequences:**

- The specification's marker visibility and presentation rules own the per-object behavior.
- Tables, code blocks, and horizontal rules remain visual objects rather than raw delimiter editing surfaces.
- Blockquotes and lists rely on structural presentation rather than caret marker decorations.
- Visual objects do not add marker-driven borders, code-language inputs, or other layout-changing affordances unless separately specified.
- Selection alone does not change marker visibility.

### Local-first

**Decision:** Leafdown has no accounts, telemetry, cloud sync, or proprietary remote storage.

**Rationale:** The application is built around direct user ownership of local files.

**Consequences:**

- Core workflows function offline.
- Configuration and recent lists persist locally.
- Network access is not required for standard operations.

### User-accessible debugging

**Decision:** Leafdown intentionally exposes webview DevTools to users for local debugging and support, and writes bounded diagnostic logs to an app-owned local logs directory.

**Rationale:** Leafdown is a local-first desktop app. When a user encounters a rendering, editor, filesystem, or platform-specific problem, local inspection is the fastest way to collect useful debugging context without adding telemetry or requiring a special debug build.

**Consequences:**

- The Help menu includes an `Open DevTools` action in user builds.
- The Help menu includes a `Diagnostics...` dialog with actions to open the local logs folder and copy a concise diagnostics summary.
- DevTools availability is a support feature, not a telemetry mechanism.
- Leafdown does not upload console output, logs, document contents, or diagnostic data automatically.
- Diagnostic logs may include operation labels, error kinds, lifecycle events, timing metadata, error messages, stack traces, and local file paths needed to debug filesystem workflows.
- Diagnostic log files use JSON Lines: each line is one JSON object with backend-owned envelope fields such as UTC timestamp, diagnostic run ID, target, and level, plus event-specific diagnostic fields.
- Leafdown must not explicitly add Markdown document text to diagnostic logs or copied summaries.
- Captured browser, editor, or library error messages and stack traces may still contain user content if that content is part of the thrown error.
- Frontend diagnostic payload normalization may truncate long strings and omit unsupported diagnostic values, but it is not privacy redaction.
- Diagnostic logs live in Tauri's app log directory: `%LOCALAPPDATA%\com.azganoth.leafdown\logs` on Windows, `~/Library/Logs/com.azganoth.leafdown` on macOS, and `$XDG_DATA_HOME/com.azganoth.leafdown/logs` or `~/.local/share/com.azganoth.leafdown/logs` on Linux.
- Local log storage is bounded by a 1 MiB active log file and five retained log files.
- Documentation and release hardening must treat DevTools as intentionally available rather than development-only.

## Editor Decisions

### Use Milkdown Kit

**Decision:** Use Milkdown Kit as the hybrid WYSIWYG Markdown editor foundation.

**Rationale:** Milkdown offers an extensible Markdown-first editor foundation with ProseMirror integration, reducing custom core development. It was chosen over a source-first document model and over alternatives that leave that model unchanged. CodeMirror 6 inverts the problem rather than removing it: a source model makes local raw-source editing free and makes every structurally rendered object bespoke, which is the larger half of this specification. It also has no footnote support in `@lezer/markdown`, no maintained Shiki integration, and would require rendering the `text/html` clipboard payload and converting pasted HTML back to Markdown, all of which ProseMirror and Milkdown supply. Lexical keeps the same semantic document model while replacing a CommonMark parser with a transformer list that has no footnote support. TipTap and other ProseMirror abstractions cannot address a cause rooted in the document model, because the model is unchanged, and they move Markdown ownership out of an upstream Markdown-native stack into Leafdown. [Issue #152](https://github.com/Azganoth/leafdown/issues/152) records the evaluation and its evidence.

**Consequences:**

- Leverage Milkdown presets and official plugins before writing custom ProseMirror modules.
- Evaluate default plugin behaviors before applying overrides.
- Build the editor through a Leafdown-owned React wrapper around Milkdown Kit rather than depending on framework adapters that introduce unwanted editor UI packages.
- The projection cost recorded in `Use temporary source projection` is accepted as the price of the objects ProseMirror renders and edits natively.
- The commitment is to ProseMirror. Milkdown supplies the schema, the remark bridge, and the plugin framework over it, and most editor code imports its ProseMirror re-exports directly.

### Accept Milkdown GFM preset behavior

**Decision:** Use Milkdown's GFM preset for parsing, rendering, and round-trip serialization, including footnotes.

**Rationale:** Maintains feature parity with the underlying editor engine.

**Consequences:**

- Defer to GFM preset defaults unless explicitly overridden by the specification.
- The preset's empty-line mechanism is overridden. It encodes a blank paragraph as an emitted `<br />` and deletes every `<br>` it finds on parse, which consumes authored raw HTML as editor state and writes a visible line break into documents other readers render. Leafdown carries a blank paragraph in blank lines instead, decided in [issue #193](https://github.com/Azganoth/leafdown/issues/193).
- The preset's single canonical autolink form is overridden. Bare GFM URL literals and angle-bracket autolinks parse into the same link, which Milkdown serializes as `<https://…>`, rewriting every bare URL in a file on its first save. Leafdown records the authored form on the link mark, decided in [issue #240](https://github.com/Azganoth/leafdown/issues/240), and writes and projects each form as authored. A bare literal falls back to the angle-bracket form when its neighbouring characters would hide it or extend its target, because a bare URL only survives where GFM reads it back. The fallback is withheld where a neighbour cannot take the literal in after all, decided in [issue #300](https://github.com/Azganoth/leafdown/issues/300), because the brackets it introduces are the characters at issue: GFM ends an email literal at a `>` its domain does not admit, and excludes a trailing `;` from the target wherever `&` and alphanumerics precede it, so a bare literal beside `\<…>` or `&lt;…&gt;` stays bare rather than being written as `<<…>>` and read back as an angle-bracket autolink between two literal brackets. That trailing rule is syntactic rather than a lookup, recorded in [issue #332](https://github.com/Azganoth/leafdown/issues/332), so a run is settled by whether the file writes it bare rather than by whether it names a character: a preserved reference and a run that names nothing are both written bare and both stand outside the target, while a run that does name one is written with a backslash the target takes in. A numeric reference carries a `#` the rule does not match, and text the run still admits after a trimmed one puts the neighbour back inside the target, so both keep the fallback. The fallback also holds wherever the file will escape the neighbour, decided in [issue #334](https://github.com/Azganoth/leafdown/issues/334), because a target takes a backslash in rather than leaving it out: a literal whose neighbour is escaped grew one backslash per save while every save still converged on its own output, which is why the neighbour is read off the sibling that holds it rather than off the serializer's own lookahead. That lookahead is the next node written in a context that is not the one it lands in, so it shows the escape for a marker `safe` settles and not for one a later pass adds, and reading the sibling asks the question once for every marker. A delimiter that closes an enclosing construct is not a sibling and is never escaped where it stands, so a literal at the end of a bold, italic, or struck-through span stays bare. Reading the sibling asks whether a marker sits there rather than whether the file will escape it, so the fallback is also taken where the escape turns out to be unnecessary, which is the form a literal gives up for a target it keeps. Narrowing when a marker is escaped, decided in [issue #336](https://github.com/Azganoth/leafdown/issues/336), narrows what the file writes without narrowing this, because the two decisions are made in an order that cannot be reversed: the literal is written before the text beside it is.
- Neither autolink form has a literal state, and this is not fixed. `mdast-util-gfm-autolink-literal` contributes an escape for the characters that would otherwise read as a protocol, a `www` lead, or an email marker, but its `fromMarkdown` side runs a `findAndReplace` over already-decoded text, after escapes are resolved, so the escape never changes what a reload produces: `https\://example.com` and `\<https\://example.com>` both reopen as a link, examined in [issue #241](https://github.com/Azganoth/leafdown/issues/241). Leafdown stops emitting an escape that cannot hold rather than pursue a parser change to give a bare URL a literal state, which is declined for the same reason the canonical form above is not. Inline code is the only durable way to show a URL or an email as text, because its content is never a `text` node the autolink transform visits.
- A character reference is decoded by `micromark` before the mdast text node exists, so `©` and `&copy;` are indistinguishable to everything downstream and a file written to stay ASCII does not stay ASCII. Leafdown records the authored form, decided in [issue #262](https://github.com/Azganoth/leafdown/issues/262), and writes it back in text and in link and image destinations alike. The run is recovered by walking each text node's value against the slice of the file it was built from, and carried on a mark whose stored source is verified against the text it covers before it is written, so an edit that invalidates it degrades to the character rather than to a stale reference. References written next to each other keep one mark each, decided in [issue #305](https://github.com/Azganoth/leafdown/issues/305), so breaking one converts only that one and leaves its neighbours preserved. ProseMirror merges neighbouring text nodes carrying an equal mark set, so a repeated reference still arrives as one node holding its characters repeated; only an equal mark merges, which makes that node whole repetitions of the one source it stores, and the verification counts them rather than reading the node as a reference the source does not spell. A preserved reference is inert for escaping: it opens no construct and closes none, and the escape passes read it as the characters it will be written as. That same verified source is what a caret reaching the reference projects, decided in [issue #298](https://github.com/Azganoth/leafdown/issues/298) on the rule [Offer the escape gesture only where the conversion exists](#offer-the-escape-gesture-only-where-the-conversion-exists) states, because breaking a valid reference commits the literal text it spells and the conversion therefore exists. This is the exception the byte-identity target in [issue #251](https://github.com/Azganoth/leafdown/issues/251) would otherwise have had to admit, and it is overridden rather than accepted, unlike the strikethrough run below, because a reference and the character it names are not interchangeable to an author who chose one.
- The preset's single heading form is overridden. Its `heading` node carries only the level, which is all an ATX and a setext heading have in common, so both parse into the same node and are written back as an ATX heading with nothing closing it, rewriting every closed and every underlined heading in a file on its first save. Leafdown records the form on the node, decided in [issue #316](https://github.com/Azganoth/leafdown/issues/316), read from the slice of the file the node was built from: an ATX heading is one line, a setext heading ends on its underline, and only the second spans more than one, so the slice also names which form it holds. What is kept is the run closing an ATX heading, the spaces or tabs opening it, and the length of a setext underline; the underline's own character answers for the level rather than the file, so a heading moved between levels one and two is underlined by the character that level reads back as. `mdast-util-to-markdown` settles both forms from one option for the whole document and sizes each run from the content it just wrote, so the option carries the authored form for the length of the heading and the runs are put back on the handler's own output. A heading the editor creates is written as ATX with one space and nothing closing it, which is also what a recorded form gives way to where the lines it lands on would not be read back as the heading: a setext underline carries only levels one and two, and a setext heading written after a paragraph in a tight list item is joined to it by a single newline, which leaves its content read as more of that paragraph and its underline covering both. The blank line the serializer writes between two headings belongs to the blank-line class rather than to this one, so `corpus/commonmark/blocks.md` loses its heading-form differences without reaching byte identity.
- The preset's single thematic break spelling is overridden. Its `hr` node carries no attributes, so `***`, `---`, `_ _ _`, and every other accepted run parse into the same node and are written back as `***`, rewriting every break in a file on its first save. Leafdown records the run on the node, decided in [issue #319](https://github.com/Azganoth/leafdown/issues/319), read from the slice of the file the node was built from, which is the whole of a break because it holds no children. Indentation stands outside that slice and the whitespace closing the line is trimmed off it, so what is kept is the characters and the spacing between them, tabs included. A break the editor creates carries `***`, which is also what a recorded run gives way to where the line it lands on would be read back as something other than a break. `mdast-util-to-markdown` joins a tight list item's children with a single newline, so a run of hyphens written after a paragraph there underlines it into a setext heading; and a run sharing its item's bullet character stands on the bullet's line, where the two read as one longer break with no list around them. The serializer already moves the bullet off the rule character it was configured with, but that character cannot answer for a run the node carries, so the run is what gives way rather than the bullet.
- The preset's outer table pipes are overridden. `mdast-util-gfm-table` calls `markdown-table` with the alignment, the padding, and the cell width it was configured with and never with `delimiterStart` or `delimiterEnd`, and exposes neither as a setting, so a table authored in GFM's pipe-optional form is written back with an outer pipe on both sides of every row. Leafdown records which outer pipes the rows carry, decided in [issue #349](https://github.com/Azganoth/leafdown/issues/349), read from the slice of the file each row was built from, and writes them from a `table` handler of its own. A table the editor creates carries both pipes, which is also what a recorded form gives way to where the rows it now holds would not be read back from the form. A blank cell at either end of a row leaves the written row opening or closing on a pipe of its own, which GFM strips before it splits the row, moving every cell after it one column; and a delimiter cell is as wide as its column, so a first column one character wide is written `-`, which opens a bullet list item where no pipe precedes it. Whether a table carries outer pipes is a property of the table rather than a layout computed across its cells, which is what separates it from the padding the consequence above normalizes: it survives an edit to any cell. The delimiter row is no node of its own, so the form is read off the rows that are, and a table whose rows disagree keeps the pipe rather than taking it off the rows that carry one.
- The preset's strikethrough delimiter run is not preserved. Its strikethrough mark carries no marker attribute, unlike emphasis and strong, so a single-tilde run parses and serializes back as a double-tilde run. This is normalized on cost under [Preserve the form a file was written in](#preserve-the-form-a-file-was-written-in) rather than overridden as the autolink form was, because both runs mean the same thing to a GFM reader. Preserving the authored run would require carrying the marker on the mark.
- The preset's strikethrough input rule is overridden. Its `(~{1,2})` backtracks to a one-tilde delimiter run when no two-tilde closing run exists yet, and its content group does not exclude the marker, so typing `~~text~~` created a mark over `~text` on the seventh keystroke and left a surplus tilde on each side that saved as an escaped character. Leafdown carries its own rule, decided in [issue #233](https://github.com/Azganoth/leafdown/issues/233), which excludes the marker from the content and anchors the match at the caret so a run stays literal text until the author closes it. This is the only input rule Leafdown owns; every other preset rule either anchors at the caret or excludes its own marker, and none of them can match a run this way.
- The replacement rule keeps the preset's leading word, colon, and slash guard, so a tilde run that touches one of those does not become a strikethrough as it is typed. `lead~~text~~` and `1~2~3` parse as strikethrough when a file holds them but stay literal text when typed, which is a real disagreement, examined in [issue #282](https://github.com/Azganoth/leafdown/issues/282) and left as it is. The guard does two jobs: it holds the word boundary, and it stops a one-tilde run from opening inside an unclosed two-tilde one. Removing it fixes the first case and breaks `~~a~b~~`, which types as a struck `b` between literal tildes, because an input rule reads only the text before the caret and cannot know another tilde is coming. Separating the two jobs means matching delimiter runs directly rather than through `markRule`, which reads one content group and cannot express the alternation. Leafdown prefers the conservative failure: literal text the author can see and correct, over a construct silently built around the wrong delimiters.
- A `*` or `_` run the preset input rules decline is paired by Leafdown instead, decided in [issue #232](https://github.com/Azganoth/leafdown/issues/232). Those rules read one content group between delimiters of equal length, so a run closed against an unequal or differently spelled one matched nothing and stayed literal: `***text*`, `_**text*`, `_**text**`, and `*__text_` kept every marker as text, and `_**text**_` closed an italic span over the literal asterisks its bold span should have spelled. The pairing that already answers a delimiter typed beside a mark now answers one typed beside literal text as well, over as many delimiters as the shorter run spells. It acts only where the preset declined, because a rule that matches consumes the typed character before the plugin sees it, which is why the preset's guards are reproduced rather than replaced and `lead**text**` still types literal. The underscore is the one exception: `\w` counts it as a word character where CommonMark counts it as punctuation, and `_**text**` cannot be read otherwise.
- The pairing waits where the closing run is shorter than the run it would pair with. An input rule reads only the text before the caret and cannot know another delimiter is coming, and here the continuations are each other: firing on the keystroke serves `***text*` at the cost of `***text**`, and refusing serves the second at the cost of the first. Reading the pair once the caret leaves the run it closed serves both, and is how typed link source already reaches the object it spells. A closing run that could equally open a construct is refused outright rather than deferred, on the conservatism above: `**a*b` leaves its delimiters as text the author can see and correct, rather than pairing a run they may still be typing into. A tilde is left out of this pass entirely, because a strikethrough is spelled only by runs of equal length.
- A pair the pairing is still waiting on is written as the literal text it is, so two saves with no edit between them write different files: `***text*` saved with the caret still on the closing run writes `\*\*\*text*`, and saved once the caret has left it writes `***text*`. That is accepted rather than repaired with a save-time finalize, because under [Preserve the form a file was written in](#preserve-the-form-a-file-was-written-in) it costs neither content nor closure: each file holds every character the document does, matches what the editor was showing, and reopens as the document that wrote it. What differs between the two is which document the author had when they saved. A pending pair is therefore not finalized before serialization where a projection is, because a projection stands in for something and a pending pair does not. Projected characters are the source of an object the document holds, so writing them unfinalized would write escaped markers where that object belongs and cost content and closure both. A pending pair's delimiters are ordinary text the author typed, and finalizing them on a save would spend the save answering the question the deferral exists to leave open, against an author who has not moved the caret off the run.
- A delimiter run flush against a mark's delimiters is written bare, decided in [issue #353](https://github.com/Azganoth/leafdown/issues/353). The two spell one run rather than a pair, and no run pairs with itself, so the mark's own pairing spends as many delimiters as the mark wrote and the run beside it is the surplus that pairing leaves literal: `\***text**`, `**text**\*`, and `\*\**text*` are written `***text**`, `**text***`, and `***text*`. Both spellings reopen as the same document, which is why neither the corpus round trip nor the document-preservation guard can see the difference, and why the coverage asserts the written bytes and the reopened document together. The escape is kept wherever the merge cannot be shown to cost nothing: where the two runs sum to a multiple of three without both being one, which CommonMark refuses wherever either run can also play the other part, and whether the mark's far delimiters can is decided by text no handler writing the run has seen; where the mark's content spells the same character, which could take the pairing the merged run is measured against; where the text before the run or past the mark spells a counterpart of its own; and for a tilde, which GFM closes only with a run of its own length.
- Develop custom UI components only when required by the product specification.

### Do not use Crepe

**Decision:** Build a custom Leafdown React editor UI directly on top of Milkdown Kit instead of using Crepe.

**Rationale:** Leafdown requires specific document styling, a custom context popup, caret-based marker logic, and custom file navigation.

**Consequences:**

- Milkdown acts as the editor foundation.
- Leafdown owns the surrounding application shell and workflows.
- Prebuilt Crepe UI styling is excluded.
- Dependencies that introduce Crepe transitively are avoided.

### Use temporary source projection

**Decision:** Use temporary source projection for supported Markdown objects: expose the active object's Markdown as editable document text, then rehydrate valid source as canonical Milkdown content or preserve invalid source as literal text.

**Rationale:** Temporary projection lets marker characters occupy ordinary ProseMirror text positions without replacing Milkdown. Decorations and widgets cannot make synthetic markers natively editable without recreating selection, deletion, clipboard, IME, and keyboard behavior. A permanent Markdown-token schema would conflict with Milkdown's CommonMark/GFM model, parser, serializer, clipboard behavior, and node and mark assumptions. The approach was selected in [issue #44](https://github.com/Azganoth/leafdown/issues/44) and [pull request #46](https://github.com/Azganoth/leafdown/pull/46), then generalized through [issue #63](https://github.com/Azganoth/leafdown/issues/63) and [pull request #64](https://github.com/Azganoth/leafdown/pull/64).

**Consequences:**

- Milkdown's canonical model remains the default; projected source is transient and never becomes saved semantic content.
- Active marker characters are ordinary unmarked document text rather than widget content.
- A clean session restores its original target exactly. Projection entry and exit are housekeeping, while user edits remain ordinary editor changes managed through an explicit projection-session history bridge.
- Projection finalizes before serialization. Valid source rehydrates semantic content; invalid source becomes the literal text it spells, so no projected character is lost except a backslash that escapes the character after it, which the file writes back.
- Marker presentation remains separate from projection lifecycle.
- Architecture owns projection lifecycle and adapter boundaries; Specification owns supported objects and observable editing behavior.

### Offer the escape gesture only where the conversion exists

**Decision:** A caret reaching text the file keeps literal by escaping projects that escape only where deleting it converts the run to an object the editor can commit. Today that is one inline link or image; every other escaped form shows nothing.

**Rationale:** Deleting an escape has to change something. An escape with no conversion behind it would be spelled as one deletion whose first half is silent and whose backslash returns on the next save, which is the defect [issue #245](https://github.com/Azganoth/leafdown/issues/245) blocked the gesture on rather than a smaller version of the feature. Restricting targets to plain text also keeps the gesture clear of contexts where escaping is not yet precise, so a projection never shows an escape the file will not write.

**Consequences:**

- Escaped emphasis, strikethrough, inline code, heading markers, and list markers are kept literal without a reversal gesture until a conversion exists for them.
- An escape flush against a live object, such as the `!` in `\![alt](x.png)`, is not a target, because it sits in no convertible run. Adapter precedence at that boundary is settled by scope rather than by ordering.
- Neither autolink form has a literal state, so neither has an escape to project.
- The projected source is the serializer's own output for the run, so the gesture stays honest without a second placement rule to keep in step with it.

### Carry a reference link rather than resolve it away

**Decision:** A reference link, a reference image, and their definitions are document content. The Milkdown preset's remark plugin that inlines every reference and deletes the definitions is removed, and the schema gains the nodes to hold what it used to discard: the form each reference was written in and the label it named travel on the link mark and the image node, and a definition is an atomic block that renders the permanent source it will be written with. A reference projects that source, and a reference written as text in the current session stays text until the file is read back. Decided in [issue #260](https://github.com/Azganoth/leafdown/issues/260).

**Rationale:** A document that names one destination once and points four references at it came back with four copies of the destination and no definition. The destination survived, so nothing was unreachable, but the file grew a copy per reference and lost the one place an author had to edit to move them all. No serializer override reaches this: the references and the definitions are gone before the editor's document exists, so the fix is where they are discarded. A definition is a leaf that holds no content an author types into, so the choice was between a block that renders its permanent source and a block whose source is edited in place. References resolve when the file is read, so an editable definition would leave every reference pointing at a destination the file no longer names until the document was reopened, which is a worse failure than needing to delete a line and write a new one.

**Consequences:**

- The reference forms round-trip byte-identically, including a definition's title marker, which is the form [issue #261](https://github.com/Azganoth/leafdown/issues/261) settled for a link and an image and could not settle for a definition while no definition survived.
- A reference whose label matches no definition is not a reference. It is the literal text it spells, which is what it already was and what a Markdown reader shows.
- Each reference keeps the casing and spacing its label was written with, because `mdast-util-to-markdown` writes the authored label in preference to the normalized identifier. Label matching is unchanged: references still resolve against one definition however they are cased and spaced.
- Projected source is parsed on its own, so the definitions the document holds are appended to it, on the technique the footnote reference adapter already uses for the definitions it fabricates. They cannot be fabricated here: whether a bracket run is a link is exactly what a definition decides, so inventing one would turn literal text into a link.
- The literal-commit path is deliberately given no definitions, so text typed this session that spells a reference stays literal. A definition an author has not looked at should not capture a bracket run they were still writing, and the file keeps that run literal either way.
- A definition's destination form and the blank lines between adjacent definitions are not preserved. Both are classes [issue #251](https://github.com/Azganoth/leafdown/issues/251) tracks for blocks generally, and a definition is now subject to them for the first time because it now survives to be written at all.

### Carry an image description as the source it was written with

**Decision:** An image description holds inline content, and the image node carries it as the source it was written with rather than as content the document holds. The node keeps the alt text the parser derived, which is what the image is named by, and carries the description's source beside it wherever that source says more than the text: emphasis, strong, inline code, strikethrough, a link, or a nested image. The description reaches the file as it stands, and the raw image Markdown a focused image exposes is that same source. Decided in [issue #259](https://github.com/Azganoth/leafdown/issues/259).

**Rationale:** The parser keeps only the text a description spells, so everything else in it was gone from the document on open and gone from the file after one save, with the destination of a nested image unrecoverable. Holding the description as document content would mean giving the image node inline children, which nothing delivers: the mdast image node carries no children to build them from, and the node view's whole surface is a raw Markdown input, so a description rich in the schema would still be edited as text. Carrying the source keeps what the author wrote and leaves the editing surface the one the image already had.

**Consequences:**

- Formatting and a nested image inside a description round-trip byte-identically, and the rendered image is still named by the text the description spells, which is the alt text an `img` element carries.
- A nested image is not a second image the editor renders, resolves, or blocks. It is source text on the image that holds it.
- A description spelling only escapes or character references carries no source of its own. Those differences are answered by the alt text and belong to the issues that settled them.
- Editing the description in the raw image Markdown replaces it with the text typed there, which the file escapes, because reading its markers back as inline content is the parse that input does not run. Editing the destination or the title leaves the description as written, and a copy through the DOM, which carries no authored attributes, falls back to the text as an edited description does.
- A description whose brackets a code span interrupts is left to its text. The source is read against the destination or the reference label the node holds, and a reading those refuse is declined rather than guessed.

## Technical Decisions

### Use Tauri

**Decision:** Use Tauri for the desktop shell, native dialogs, filesystem access, and packaging.

**Rationale:** Leafdown is a desktop-first application requiring direct local file and directory access.

**Consequences:**

- Native file workflows are handled via Tauri/Rust APIs.
- Desktop packaging is integrated into the primary build pipeline.

### Use React, TypeScript, and Vite

**Decision:** Use React with TypeScript and Vite for the frontend.

**Rationale:** Requires a modern desktop UI shell with strong typing, fast hot-reloading, and Tauri compatibility.

**Consequences:**

- User interface layout is built as React components.
- TypeScript defines frontend types and integration contracts.
- Vite handles frontend development builds and compilation.

### Use a custom titlebar and menu shell

**Decision:** Leafdown uses its own titlebar and menu shell.

**Rationale:** The titlebar and menus should blend with Leafdown's aesthetic and command architecture rather than default OS frames.

**Consequences:**

- Window decorations are implemented as custom UI components.
- Menu commands are executed according to the application command model.
- The window controls behave as non-client area: they stay out of the tab sequence like native Win32 caption buttons, remain labeled in the accessibility tree, and leave `Alt+Space` as the keyboard path to minimize, maximize, and close.

### Gate on defect classes automation can reach

**Decision:** A gate is adopted when it catches a defect class this project produces, and rejected when it mainly produces work. Coverage floors ratchet below the measured numbers rather than setting targets.

**Rationale:** None of the substantive `fix:` commits would have been caught by the linter or the type checker. They were boundary-semantics defects: a capability scope that denied every path, clipboard formats, Windows path grammar, persisted state trusted at its type. Tests are the gate that protects this codebase.

**Consequences:**

- The `correctness` and `suspicious` categories carry the lint rules. A rule whose reports hold is satisfied by changing the code, and a rule that is right about most of its reports keeps its place with the few it is wrong about suppressed where they sit; turning one off is reserved for a rule whose reports do not hold anywhere in the repository. `no-unsafe-type-assertion` reports the boundary narrowing the ProseMirror, Tauri, and persisted-state contracts are built on; `consistent-return` would be satisfied by a `default` clause, which is the thing that stops a new union member from failing the build; `react-in-jsx-scope` is obsolete under the JSX transform the build selects. Categories past those two stay off, which is what keeps `eqeqeq` and rules like it, which argue with idioms that are correct here, from arriving at all.
- A green `cargo audit` is not evidence that dependencies are maintained. It gates on vulnerability advisories only, and the unmaintained and unsound warnings it also reports are largely GTK3 crates that never reach the Windows bundle.
- Actions are pinned by major tag rather than commit SHA.
- A full `tauri build` stays off the pull request path, and manifest version consistency is a release checklist line rather than a script.
- The pre-commit hook formats but does not apply lint fixes, so a commit cannot differ from the diff its author read.
- The pre-push hook runs the whole-program type check and lint, which reach the class the staged pre-commit pass cannot see: an edit that breaks a file it did not stage. Rust checks stay off it, because clippy costs minutes on a cold cache.
- Rust import grouping is a convention rather than a check. The rustfmt options that would enforce it are nightly-only, and stable rustfmt warns, ignores them, and exits 0, so configuring them without a second toolchain would leave a passing check that enforces nothing.
- Behavior that needs a real `AppHandle` is verified at runtime rather than against `tauri::test::mock_app`. The mock runtime cannot load on Windows without an application manifest cargo does not give test binaries, and it never dispatches custom protocols, so the asset protocol boundary stays unreachable either way; [issue #116](https://github.com/Azganoth/leafdown/issues/116) records the setup should a second such command make it worth revisiting.

### Replace saved files through a staged rename

**Decision:** Saves write the contents to a staging file beside the target, sync it, and rename it over the target. Symlinked targets are resolved first so the write goes through to the link target. Windows attributes and ACLs are not copied onto the staging file.

**Rationale:** Leafdown edits ordinary files with no vault, sidecar, or cloud copy, so the file on disk is the only copy and a truncating write leaves it destroyed for the length of the write. Replacing a symlink rather than writing through it would silently detach a linked document from wherever it points; the folder-scan rule that skips symlinked entries governs listing, not writing. Carrying the target's attributes and ACLs across would need `ReplaceFileW`, which is Windows-only and outside `std`.

**Consequences:**

- The guarantee is atomic replacement, not crash-proof persistence: the rename's durability rests on filesystem metadata journaling.
- A save replaces the file rather than rewriting it, so non-inherited ACLs, the hidden attribute, alternate data streams, and hardlink identity do not survive it.
- Replacing a file requires delete access to the target, so a process holding the document open without delete sharing blocks a save that a truncating write would have completed.
- Every save costs one fsync of the document contents.

### Own persisted state contracts instead of a schema library

**Decision:** Persisted state is validated by a Leafdown-owned contract layer rather than Zod, Valibot, or a comparable library. A contract reports one of three outcomes for a value — valid, repaired, or invalid — and a store declares its persisted shape as a map of contracts that the `{ changed, state }` sanitizer is derived from.

**Rationale:** Schema libraries model parsing: input to output, success or failure. Persisted state needs repair with provenance, because the sanitizer has to distinguish a value it accepted from one it rewrote in order to know the file on disk is stale. Rebuilding that third outcome on top of a two-outcome parse fails in both available directions. Zod and Valibot clone arrays and objects, so change detection by identity fires on every valid load and would rewrite both preference files at every launch; detecting a rewrite through parse issues instead misses transforms entirely, so a bounded list truncated during load reports no change and the file is never repaired. Using a schema purely as a predicate avoids both faults and reduces to the predicate table it was meant to replace. Neither library's headline advantage reaches this project: bundle size is immaterial to a WebView loading from local disk, and the ecosystem is unused without a form library or a network boundary.

**Consequences:**

- Persisted state declares a contract shape, and `satisfies Record<keyof State, unknown>` makes an undeclared field a build error rather than a silently unvalidated one.
- A store's persisted key list and its sanitizer are derived from that one shape, so a field cannot be validated without also being persisted.
- A contract returns the value it was given when it accepts one, so an unchanged load neither copies state nor triggers a file rewrite.
- Nested persisted objects salvage field by field, so one corrupt sub-field costs only itself. Whether that is right for a given setting is a per-call-site choice, and an all-or-nothing variant is added when a setting needs one.
- Nested persisted state additionally needs a deep merge against store defaults before it can be used, because the persistence plugin applies loaded state through Zustand's shallow merge, which reaches only the top level.
- The layer covers persisted state only. Tauri command results stay validated at the Rust boundary.
- Extending validation is a local change with no dependency surface, and its type-checking cost stays proportional to the shapes actually declared.
- The salvage and repair behavior is Leafdown's to maintain and test.

### Expose the article navigator as a flattened tree

**Decision:** The article navigator is an ARIA `tree`, flattened rather than nested: the scrolling list carries `role="tree"`, every row is a `treeitem` child of it, one row at a time holds the tab stop, and depth travels on `aria-level` with `role="group"` omitted. Selection does not follow focus — `aria-selected` marks the open document, and only `Enter`, `Space`, and click open one.

**Rationale:** Hierarchy has to be announced, not just indented, and a flat list of buttons has nowhere to put nesting, position, or expanded state. The nested `role="group"` markup the pattern usually shows cannot be produced here, because virtualization keeps only a window of rows in the DOM and a group wrapper would have to enclose children that do not exist; `aria-level` carries the same relationship without the DOM nesting. Selection following focus would open every document arrowed past, thrashing the editor. The tab stop roves across rows rather than resting on the container with `aria-activedescendant`: the active descendant still has to be a rendered row, so that model does not avoid keeping the focused row alive, and it gives up the native focus ring the rows already carry.

**Consequences:**

- `aria-setsize` and `aria-posinset` are scoped to siblings under the same parent and computed in the row model, because a flat row index answers a different question and the DOM holds only a window of rows.
- Every `treeitem` carries `aria-selected`, including directory rows that can never be selected. A tree where only some items carry it has the rest announced as "not selected".
- `aria-current` no longer marks the open document. The `data-active` visual treatment is unchanged.
- The focused row and the selected row are routinely different, which is what file-explorer users expect.
- Rows are `treeitem`s rather than buttons, so their keyboard behavior is the tree's to implement rather than something the platform supplies.
- The row holding the tab stop has to stay rendered even when it scrolls out of the virtualized window. Unmounting it drops focus to the document body and leaves the navigator with no tab stop at all, which would take the scroll region out of the tab sequence.

### Build UI primitives on Base UI

**Decision:** The primitives in `src/components/ui/` are built on `@base-ui/react`, and the project is managed through the shadcn CLI with `components.json`. Toast notifications use Base UI Toast rather than a separate toast dependency. The wrappers remain hand-owned; the CLI is not used to regenerate them.

**Rationale:** Radix remains maintained and unblocking, so the move is elective rather than forced. It follows the base library shadcn made the default for new projects, and it ends Leafdown's reliance on Radix positioning internals: the editor context popup drove its repositioning transition off `[data-radix-popper-content-wrapper]`, an undocumented wrapper element, from a component, a stylesheet, and a test at once. Base UI positions through an element the application owns. Keeping a separate toast dependency alongside it would leave two interaction vocabularies in the same layer.

**Consequences:**

- The CLI writes kebab-case files into `src/components/ui/`, which is why component file names follow that convention rather than React's `PascalCase`.
- Base UI Toast supplies no default styling and no fixed set of toast types, so toast presentation, types, and announcement behavior are Leafdown's to own.
- Where a Base UI default disagrees with behavior Leafdown already had, the wrapper carries the override, so consult the wrapper rather than Base UI's documentation for what a primitive does here.

## Platform Decisions

### Windows first, cross-platform aware

**Decision:** Initial polish targets Windows while avoiding unnecessary Windows-only assumptions.

**Rationale:** Windows is the initial target OS; code should remain cross-platform compatible.

**Consequences:**

- Windows UX is optimized first.
- Operating system differences (shortcuts, paths, line endings) are handled explicitly.

### Desktop first, web-possible later

**Decision:** Leafdown is desktop-first; a limited web version may be explored later.

**Rationale:** Core workflows rely on direct file IO, which is limited or inconsistent in standard web browsers.

**Consequences:**

- Desktop workflows are the primary design target.
- UI components avoid implicit desktop-only assumptions where practical.
- Any future web implementation may require a restricted filesystem subset.

## Distribution Decisions

### Keep Leafdown open source

**Decision:** Leafdown source code is public and distributed under an open-source license.

**Rationale:** The codebase remains public to support community inspection and contribution.

**Consequences:**

- The repository, source code, and license verify that Leafdown is open source.
- Public contribution workflows leverage the main repository.

### Use GPL-3.0-or-later license

**Decision:** Leafdown is licensed under GNU General Public License v3.0 or later (`GPL-3.0-or-later`).

**Rationale:** Ensures the codebase remains open source, requiring modified distributions to preserve equivalent rights.

**Consequences:**

- A `LICENSE` file is maintained in the repository root.
- Metadata and About dialogs reference `GPL-3.0-or-later`.
- Contributions are accepted under the project license.

### Free app with optional donation support

**Decision:** Core functionality is free, with optional donation/support.

**Rationale:** The distribution model must not introduce friction or lockouts in the main editing workflow.

**Consequences:**

- Donation options are located in passive surfaces (Settings, Help, or About).
- All core editing functionality is available without payment.
