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

**Decision:** Save preserves an authored Markdown spelling when a node or mark can carry it through edits. Content and round-trip correctness take precedence: serialization must neither lose document content nor produce a file that reloads as a different document. A spelling with no owner, or one invalidated by an edit, uses a canonical fallback. This replaces the earlier policy of normalizing files to application defaults; [issue #251](https://github.com/Azganoth/leafdown/issues/251) tracked the form classes.

**Rationale:** The earlier policy rewrote 12 of 16 scoped corpus files on first save ([issue #135](https://github.com/Azganoth/leafdown/issues/135)). Those unsolicited diffs are costly in ordinary files and versioned repositories. A September 2026 comparison with Typora 1.14.9 also found that it preserved the tested authored forms across saves and edits. Content loss and a failed round trip are defects; choosing between equivalent spellings is the only discretionary part.

**Consequences:**

- Judge a form change by all the rewrites it forces. For example, replacing a tilde fence with backticks may also require changing a backtick in its info string.
- Preserve whitespace a node owns, including two or more spaces that spell a hard break, and whitespace the parser retains as content. Normalize line-edge whitespace the parser trims. Restoring that whitespace can create a hard break or cancel a backslash break, and ordinary tooling removes it independently ([issue #400](https://github.com/Azganoth/leafdown/issues/400)).
- Normalize a backslash before punctuation when no construct can open there. The document model does not own that escape, though this gives up an authored spelling; retain it where the literal text needs protection.
- Every preserved form needs a safe canonical fallback. A bare URL may gain angle brackets when its neighbours would hide it; an invalidated character reference becomes the character it names; a thematic break uses `***` when its authored run would merge with surrounding syntax. Do not preserve a new form class until its fallback is known.
- Normalize table cell padding, delimiter widths, and alignment padding. They depend on whole-column layout rather than one node's form ([issue #323](https://github.com/Azganoth/leafdown/issues/323)).
- A missing separator between blocks belongs to the second block. Preserve it only while the assembled document still parses as separate blocks; assess the preceding innermost block because lists and blockquotes allow lazy continuation ([issue #324](https://github.com/Azganoth/leafdown/issues/324)).
- Record continuation-line prefixes per line on the containing block. Fall back to the prefix its current containers spell when the recorded prefix would change its meaning; inserted lines use that canonical prefix ([issues #322](https://github.com/Azganoth/leafdown/issues/322) and [#381](https://github.com/Azganoth/leafdown/issues/381)).
- Preserve a list item's authored marker indentation where its columns still agree with its current containers. A tab can span both a container and the item, so the record may cover the whole line prefix; fall back when it would move a marker into another construct or open indented code. This does not preserve independent blockquote indentation ([issue #390](https://github.com/Azganoth/leafdown/issues/390)).
- Preserve tabs in an indented code block's per-line indentation only when they end at its content column and agree with its container markers. A tab that overshoots that column would change the block's value; a spaces-only prefix needs no record ([issues #399](https://github.com/Azganoth/leafdown/issues/399) and [#401](https://github.com/Azganoth/leafdown/issues/401)).
- Indentation is not an output preference. Where no authored spelling survives, write the column the structure requires: a list item's content column, and four columns for a footnote definition's later lines and for indented code. A narrower width leaves the container, and a wider one becomes content in indented code or raw HTML. How far a newly nested list item stands past its parent's content column is a form axis for new content, answered by inheritance if it is ever decided ([issue #546](https://github.com/Azganoth/leafdown/issues/546)).
- New lists and headings inherit the document's prevailing form per form axis; disagreement or no evidence uses the serializer default. Settle the form when the construct is created, so later edits elsewhere do not restyle it. Other construct defaults remain fixed until decided separately ([issue #360](https://github.com/Azganoth/leafdown/issues/360)).
- Formatting preserves unnamed form attributes while a block remains the same construct, such as a heading changing level. Conversion to another construct starts with that construct's default form ([issue #359](https://github.com/Azganoth/leafdown/issues/359)). An edit that changes the property a form spells drops that form: unchecking and rechecking `[X]` writes the default `[x]`.
- Equivalent constructs follow one serialization rule; for example, strikethrough wraps a link as strong and emphasis do. A nesting order ProseMirror stores only as a mark set has no authored order to preserve.
- Output-formatting preferences remain deferred. Preserving existing form and choosing the initial form for new content are separate concerns; prevailing document form currently answers the latter for lists and headings.

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
- Loading a remote image is optional network use that only an explicit per-image action starts; nothing depends on it.

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

### Render self-contained, allowlisted raw HTML

**Decision:** Render a stored raw-HTML token live only when it contains exactly one complete element accepted unchanged by the attribute-free allowlist in [Rendering](./specification.md#rendering). This supersedes the former text-only HTML policy. All other tokens retain their muted source presentation.

**Rationale:** CommonMark HTML is a token stream, and an inline HTML atom cannot own the Markdown siblings between separate opening and closing tags. Parsing into a source-located inert tree, validating the entire tree, and constructing its DOM only with element and text-node primitives prevents partially sanitized output from disagreeing with the stored source while retaining the offsets needed for exact pointer entry. [Issue #61](https://github.com/Azganoth/leafdown/issues/61) records the accepted boundary.

**Consequences:**

- The atom's authored `value` remains the sole serialization source; rendering never rewrites it.
- No attributes, URL-bearing elements, namespaced content, scripts, forms, or embedded documents are admitted. Markdown link and image resolution keep their existing ownership.
- Raw HTML uses shared in-document source projection. Clean sessions restore the original token, valid edited source returns to safe rendering, and incomplete or unsupported edits become literal text without discarding characters.
- URL-bearing HTML, configurable allowlists, and custom CSS remain deferred under the existing `Post-rendering HTML controls` Project draft.

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

**Decision:** Use Milkdown's GFM preset for parsing, rendering, and serialization, including footnotes. Keep its defaults unless a documented Leafdown behavior requires an override.

**Rationale:** The preset supplies the supported Markdown foundation. Its canonical serializer and some input rules nevertheless lose authored form or misread typed delimiters; the overrides below retain content and safe round trips.

**Consequences:**

- Blank paragraphs use blank lines. The preset's `<br />` representation would consume authored raw HTML as editor state ([issue #193](https://github.com/Azganoth/leafdown/issues/193)).
- Preserve bare GFM URL literals and angle-bracket autolinks as authored. A bare literal falls back to angle brackets only when neighbours would hide or extend its target. Decide against the spelling the file will write, including escaped neighbours and enclosing delimiters; a `>` or trimmed `;` beside a literal may leave the bare form safe ([issues #240](https://github.com/Azganoth/leafdown/issues/240), [#300](https://github.com/Azganoth/leafdown/issues/300), [#332](https://github.com/Azganoth/leafdown/issues/332), [#334](https://github.com/Azganoth/leafdown/issues/334), and [#336](https://github.com/Azganoth/leafdown/issues/336)).
- Neither autolink form has a durable literal state: the GFM transform recognizes already-decoded text, so escaping a URL or email marker does not prevent recognition on reload. Do not emit an ineffective escape; inline code is the durable literal form ([issue #241](https://github.com/Azganoth/leafdown/issues/241)).
- Preserve the source of character references in text, destinations, and titles while it still decodes to the stored value. Adjacent references retain independent forms; repeated equal marks may merge into one text node and must be verified as whole repetitions. An invalidated reference falls back to its decoded character ([issues #262](https://github.com/Azganoth/leafdown/issues/262), [#305](https://github.com/Azganoth/leafdown/issues/305), and [#435](https://github.com/Azganoth/leafdown/issues/435)).
- Project preserved references as source. Convert a newly typed valid reference on its terminating `;`, then let projection handle further edits and undo. Document-state conversion on caret leave would also convert source a file deliberately escaped ([issues #298](https://github.com/Azganoth/leafdown/issues/298) and [#299](https://github.com/Azganoth/leafdown/issues/299)).
- Preserve ATX or setext heading form, ATX opening spacing and closing run, and setext underline length. A created heading defaults to an unclosed ATX heading with one space; a setext form falls back where its level or surrounding block structure makes it unreadable ([issue #316](https://github.com/Azganoth/leafdown/issues/316)).
- Preserve a thematic break's run and internal spacing, but fall back to `***` if it would become a setext underline or merge with a list marker. Created breaks use `***` ([issue #319](https://github.com/Azganoth/leafdown/issues/319)).
- Preserve a hard break's authored spaces or backslash where the line still reads as a break. Fall back to a backslash if a spaces run would end a blank line or absorb adjacent whitespace. A soft break carries no hard-break run ([issue #388](https://github.com/Azganoth/leafdown/issues/388)).
- Preserve indented versus fenced code, fence character and surplus length, spacing before an info string, safe root indentation, and whether a fence was left open at its container's end. Use a closed backtick fence for newly created or invalidated forms. Indented code cannot carry an info string or begin or end with a blank line; a fence must outrun runs in its content. Do not infer a fence's own indentation from a column inside a container, where the container prefix cannot be separated reliably ([issues #320](https://github.com/Azganoth/leafdown/issues/320) and [#321](https://github.com/Azganoth/leafdown/issues/321)).
- Preserve a table's optional outer pipes when its rows can still be parsed in that form. Created tables use outer pipes; a missing pipe falls back when an edge blank cell would shift columns or a delimiter could open a list ([issue #349](https://github.com/Azganoth/leafdown/issues/349)).
- Normalize an authored single-tilde strikethrough delimiter to the preset's double tilde. Both read alike in GFM, and the mark has no delimiter attribute.
- Override the preset's strikethrough input rule so it waits for a closing run and does not include marker characters in its content ([issue #233](https://github.com/Azganoth/leafdown/issues/233)). Keep its word, colon, and slash guard. It leaves some parseable typed runs literal, because removing the guard would silently pair incomplete runs incorrectly ([issue #282](https://github.com/Azganoth/leafdown/issues/282)).
- Pair `*` and `_` runs the preset declines when their delimiter lengths or spellings differ, using as many markers as the shorter run supplies. Defer a pair whose closing run may still grow until the caret leaves it; refuse a run that could equally open an unfinished construct. Do not extend this pass to tilde runs ([issue #232](https://github.com/Azganoth/leafdown/issues/232)).
- A pending pair remains literal when saved. Moving the caret may complete it without another edit, so two saves can have different spelling while each still retains its document content and reloads correctly. Projection differs because it stands in for an existing object and must finalize before serialization.
- Write a literal delimiter run flush against a compatible mark without redundant backslashes only when the merged run provably reopens as the same document. Keep escapes for ambiguous multiple-of-three runs, competing delimiters in surrounding text, and tilde runs ([issues #353](https://github.com/Azganoth/leafdown/issues/353) and [#372](https://github.com/Azganoth/leafdown/issues/372)).

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
- Active marker characters are ordinary unmarked document text rather than widget content. A widget may stand beside them to show what the source names, such as the character a projected reference renders, because that is read rather than edited and holds no position the source spells. Such a widget reads as the content it stands for while the source beside it keeps the marker styling, which is the same division the projection already draws.
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

**Decision:** A reference link, a reference image, and their definitions are document content. The Milkdown preset's remark plugin that inlines every reference and deletes the definitions is removed, and the schema gains the nodes to hold what it used to discard: the form each reference was written in and the label it named travel on the link mark and the image node, and a definition initially survived as an atomic block that rendered the permanent source it would be written with. A reference projects that source, and a reference written as text in the current session stays text until the file is read back. The atomic definition presentation was superseded by [Edit a reference definition through synchronized fields](#edit-a-reference-definition-through-synchronized-fields). Decided in [issue #260](https://github.com/Azganoth/leafdown/issues/260) and superseded in part by [issue #421](https://github.com/Azganoth/leafdown/issues/421).

**Rationale:** A document that names one destination once and points four references at it came back with four copies of the destination and no definition. The destination survived, so nothing was unreachable, but the file grew a copy per reference and lost the one place an author had to edit to move them all. No serializer override reaches this: the references and the definitions are gone before the editor's document exists, so the fix is where they are discarded. A definition is a leaf that holds no content an author types into, so the choice was between a block that renders its permanent source and a block whose source is edited in place. References resolve when the file is read, so an editable definition would leave every reference pointing at a destination the file no longer names until the document was reopened, which is a worse failure than needing to delete a line and write a new one.

**Consequences:**

- The reference forms round-trip byte-identically, including a definition's title marker, which is the form [issue #261](https://github.com/Azganoth/leafdown/issues/261) settled for a link and an image and could not settle for a definition while no definition survived.
- A reference whose label matches no definition is not a reference. It is the literal text it spells, which is what it already was and what a Markdown reader shows.
- Each reference and each definition keeps its label as the file spelled it: its casing, its spacing, and its escapes. References still resolve against one definition however they are cased and spaced, but CommonMark matches on the label as spelled, so a backslash in a label is part of what the label names rather than the form the backslash consequence of [Preserve the form a file was written in](#preserve-the-form-a-file-was-written-in) normalizes: `[r|s]` and `[r\|s]` are two labels matching two definitions, and a table cell can spell only the second. Leafdown writes the label itself, because `mdast-util-to-markdown` writes it decoded and outside the constructs that escape a cell's `|`. A shortcut or collapsed reference whose plain text is written with fewer escapes than its label is written with the label as its text, which reads back as the same text and keeps the form. A label spelled with a bare `|` that reaches a table cell is written with the escape, which keeps the row and gives up the match, since its definition spells the pipe bare. Settled in [issue #454](https://github.com/Azganoth/leafdown/issues/454).
- Projected source is parsed on its own, so the definitions the document holds are appended to it, on the technique the footnote reference adapter already uses for the definitions it fabricates. They cannot be fabricated here: whether a bracket run is a link is exactly what a definition decides, so inventing one would turn literal text into a link.
- The literal-commit path is deliberately given no definitions, so text typed this session that spells a reference stays literal. A definition an author has not looked at should not capture a bracket run they were still writing, and the file keeps that run literal either way.
- A definition's destination form and the blank lines between adjacent definitions are the block classes [issue #251](https://github.com/Azganoth/leafdown/issues/251) settles generally, which a definition became subject to for the first time by surviving to be written at all. Both are preserved, in [issue #325](https://github.com/Azganoth/leafdown/issues/325) and [issue #324](https://github.com/Azganoth/leafdown/issues/324), so an angle-bracket destination and two definitions written on consecutive lines are written back as they were.

### Carry an image description as the source it was written with

**Decision:** An image description holds inline content, and the image node carries it as the source it was written with rather than as content the document holds. The node keeps the alt text the parser derived, which is what the image is named by, and carries the description's source beside it wherever that source says more than the text: emphasis, strong, inline code, strikethrough, a link, or a nested image. The description reaches the file as it stands, and the raw image Markdown a focused image exposes is that same source. Decided in [issue #259](https://github.com/Azganoth/leafdown/issues/259).

**Rationale:** The parser keeps only the text a description spells, so everything else in it was gone from the document on open and gone from the file after one save, with the destination of a nested image unrecoverable. Holding the description as document content would mean giving the image node inline children, which nothing delivers: the mdast image node carries no children to build them from, and the node view's whole surface is a raw Markdown input, so a description rich in the schema would still be edited as text. Carrying the source keeps what the author wrote and leaves the editing surface the one the image already had.

**Consequences:**

- Formatting and a nested image inside a description round-trip byte-identically, and the rendered image is still named by the text the description spells, which is the alt text an `img` element carries.
- A nested image is not a second image the editor renders, resolves, or blocks. It is source text on the image that holds it.
- A description spelling only escapes carries no source of its own, because the file escapes the alt text wherever it needs one. A description spelling a character reference is carried, decided in [issue #435](https://github.com/Azganoth/leafdown/issues/435): the alt text holds the character the reference names, and the mark that records a reference in text cannot reach alt text, which holds no marks.
- Editing the description in the raw image Markdown replaces it with the text typed there, which the file escapes, because reading its markers back as inline content is the parse that input does not run. A character reference is not a marker, so the input reads one as the character it names, as the parser reads the alt text, and shows an ampersand in the alt text that would open one escaped. An edited description therefore degrades a reference to its character rather than to its literal source. Editing the destination or the title leaves the description as written, and a copy through the DOM, which carries no authored attributes, falls back to the text as an edited description does.
- A description whose brackets a code span interrupts is left to its text. The source is read against the destination or the reference label the node holds, and a reading those refuse is declined rather than guessed.

### Rename a footnote definition's references with its label

**Decision:** A footnote definition's label is document content rather than an attribute the editor only renders. The definition's first child holds the label as text, `[^` and `]:` are drawn around that node as generated content, and committing a label edit renames the definition and every reference that named it in one change. An empty label, a label holding a bracket or a line ending, and a label another definition already answers to do not commit. The reverse direction is unchanged: editing a reference label renames nothing. Decided in [issue #407](https://github.com/Azganoth/leafdown/issues/407).

**Rationale:** [Carry a reference link rather than resolve it away](#carry-a-reference-link-rather-than-resolve-it-away) refused an editable definition because it would leave every reference pointing at a destination the file no longer names until the document was reopened. A footnote label is the same resolution key, so this issue had to answer that objection rather than inherit it. Renaming both sides together is the answer: the key moves atomically and nothing is left stale, which is what the earlier decision could not get from a definition whose references it did not also own. The definition is the one place an author edits to move them all, which is the property that decision was protecting. Refusing the edit where references exist would withhold the feature exactly where a rename is wanted, and orphaning them is the rejected failure itself. This decision initially left link and image reference definitions outside the mechanism on the distinction that a footnote definition already contains prose; [Edit a reference definition through synchronized fields](#edit-a-reference-definition-through-synchronized-fields) superseded that exclusion for the three fields a reference definition does hold.

**Consequences:**

- Footnote definitions move from the permanent-syntax-marker list to the editable-raw-syntax list in the Specification, and the presentation no longer depends on the caret.
- The marker runs are generated content rather than a decoration or a widget, so they hold no document position at all. A caret aimed at one resolves inside the definition, which is what [issue #197](https://github.com/Azganoth/leafdown/issues/197) fixed, and it now holds by construction rather than by a placement rule.
- [Use temporary source projection](#use-temporary-source-projection) is not the mechanism. Its guarantees are that projected source is transient, that a clean session restores its original target exactly, and that projection finalizes before serialization; an always-open presentation on every definition in the document is none of those, and the engine holds one session where this needs one per definition. The label is schema content instead, so selection, deletion, clipboard, and IME are ProseMirror's rather than recreated.
- The committed label stays on the definition and the label node holds what is being typed, so the rename is derived from the two disagreeing rather than tracked as a session. A caret leaving, `Undo` restoring the earlier text, and `Redo` restoring it again are answered identically, and the rename is never stored to be reversed. It stays out of history for the same reason: capturing it would put a redundant step behind every `Undo` of the typing that caused it.
- `Undo` returns the caret to the label along with the text, which reopens the edit, so a reversed rename settles on the next caret leave. Writing the file commits first, on the seam projection already finalizes at, so a file is never written with a label its references disagree with.
- A label is valid when `[^` and `]:` can be written around it and read back unchanged, which covers empty, whitespace-only, and bracket- or newline-bearing labels without a rule for each.
- `joinTextblocksAround` reads `isolating` only on nodes it descends through to reach a textblock, so the label needs an explicit guard against a backspace arriving from the body; a forward delete is already refused by `findCutAfter`.

### Edit a reference definition through synchronized fields

**Decision:** A link or image reference definition holds its label, destination, and optional title as three editable document-text fields. The brackets, colon, destination delimiters, title delimiters, and authored separators around them are generated chrome with no document position. Chrome follows the text while it is being typed. A committed label edit renames every reference that resolved to the definition, and a committed destination or title edit updates the resolved destination and title those references carry. While the caret is in a definition with no title, the empty title field appears through a quoted `title (optional)` ghost marker with the caret immediately after its opening quote; typing there creates the title and deleting its content removes it again. Decided in [issue #421](https://github.com/Azganoth/leafdown/issues/421).

**Rationale:** The atomic block chosen in [Carry a reference link rather than resolve it away](#carry-a-reference-link-rather-than-resolve-it-away) protected references from becoming stale but made the definition—the one source location meant to move all of them—the only place that could not be edited. The footnote-label mechanism established how a field can be ordinary ProseMirror text while its committed value remains on the parent and how a commit can move both sides together without a separate editing session. Applying that model to all three reference-definition fields answers the stale-reference objection directly. Making references dynamically consult definitions while rendering would remove the copied-value model across projection, activation, and image handling; commit-time synchronization keeps those existing boundaries and is the smaller change.

**Consequences:**

- The presentation is permanent rather than a source-projection session. Selection, clipboard, composition input, and history remain ProseMirror behavior over real text; generated chrome cannot receive the caret.
- A destination that begins needing angle brackets gains them while it is typed. A parenthesized title that begins needing another marker moves to a quote while it is typed. Authored separators, including the line endings that make a definition span two or three lines, remain chrome and round-trip unchanged.
- An absent title has a reachable position while the caret is in its definition. The ghost uses the authored title separator, so it stands as far from the destination as a filled title. Its opening quote stands before the empty field and its remaining hint stands after it, so right arrow from the destination and a click on the ghost marker place the caret between the quote and the hint text. The default quoted marker becomes real when text is typed and returns when all title text is deleted.
- A field commits when the caret leaves it and before serialization. The parent retains the committed values and authored form, so `Undo` and `Redo` can restore field text and let the same derived commit settle it again without recording a second history step.
- CommonMark-normalized label collisions and labels the definition syntax cannot write do not commit. The previous label is restored. An empty destination is writable as `<>`, and an empty title means no title.
- Only the first definition answering to a normalized label owns its references, matching CommonMark resolution. Editing a later duplicate changes that definition without redirecting references that resolve to the first.

### Use hierarchical local gutters for block selection

**Decision:** Every eligible block exposes a local gutter at its own logical start. From content outward it carries an inner selection handle, a middle insertion slot, and an outer passive source-marker slot. A Leafdown-owned selection represents an exact contiguous range in the selectable-block traversal, including endpoints under different structural parents. Complete list items own nested content, deeper list items remain selectable, blockquotes expose their container and eligible children, and tables remain atomic while native cell selection keeps precedence. The root document continues to reserve the physical gutter inside its own width; nested gutters follow existing list and quote indentation. The selection is painted with node decorations and the existing context popup anchors to the selected blocks' rendered bounds. Decided in [issue #477](https://github.com/Azganoth/leafdown/issues/477), validated in [issue #483](https://github.com/Azganoth/leafdown/issues/483), with selection implemented in [issue #478](https://github.com/Azganoth/leafdown/issues/478) and insertion in [issue #480](https://github.com/Azganoth/leafdown/issues/480).

**Rationale:** A root-only gutter makes a long list or blockquote look like one coarse target even when the author is acting on one nested item. A text selection cannot carry a structural range cleanly, and a one-node `NodeSelection` cannot represent a multi-block range. ProseMirror's custom-selection extension point can retain exact directional block endpoints while its ordinary open slices keep cross-parent copy, replacement, mapping, and history structurally valid without adding document content. Aligning each gutter to the block's rendered start lets indentation disambiguate structural depth, while retaining the reserved root width prevents the control from moving document text at narrow widths. Reusing one selection-aware popup keeps command ownership and focus behavior in the surface that already acts on selections.

**Consequences:**

- No block-selection state, gutter control, or selection decoration reaches serialized Markdown.
- The selection stores exact directional block boundaries, returns ProseMirror's open structural slice between them, and maps its bookmark through document changes and source-projection finalization.
- Extending across separate list wrappers does not promote an endpoint or absorb an adjacent list item. If a selected owning block contains selectable descendants, only the owner is painted so the presentation does not duplicate one structural selection.
- Block handles are pointer controls with no per-block tab stop. Selection changes are announced while the editor retains focus; keyboard entry and navigation consume the same selection model in their own focused interaction layer.
- One insertion button follows the pointer within the local gutter. Horizontal position chooses an eligible depth; vertical position chooses a valid sibling boundary. The insertion indicator is presentation only, and the menu commits one block at that boundary. Handle dragging suppresses the popup and moves the selected range among valid siblings through the same boundary rules as keyboard and popup movement; it does not reparent blocks across depths.
- The context popup has one selection-aware anchor and filters inline-only actions for structural selection instead of introducing a second handle menu.

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

### Load approved remote images through a backend fetch

**Decision:** An approved remote image is fetched by the Rust backend and presented through a `blob:` object URL, so the WebView never contacts the remote host. The fetch uses `reqwest` with `native-tls`, no proxy, cookies, automatic decompression, or `Referer`, and a DNS resolver that returns only public addresses; IP literals, which bypass the resolver, are checked separately, and every redirect hop is re-validated. The only CSP change is `blob:` in `img-src`. Decided in [issue #514](https://github.com/Azganoth/leafdown/issues/514).

**Rationale:** Tauri's CSP is static, so letting the WebView load an approved image would mean `img-src https:` for the whole app, and every image-bearing path, CSS `url()` included, would reach the network with the CSP no longer a backstop. The WebView also gives the app no hook for redirects to private addresses, size limits, type checks, or its own HTTP cache, and it sends a referrer and client hints. A temporary file served through the asset protocol writes remote content to disk and needs cleanup across crashes; a custom URI scheme adds backend state and a release lifecycle; a `data:` URL is broader than `blob:`. `native-tls` uses the operating system's trust store and TLS stack and costs the least binary size of the TLS backends measured.

**Consequences:**

- Filtering at resolution means the connector dials only addresses already judged public, with no window for DNS rebinding between a check and the connection.
- A proxy would resolve names outside that filter, so networks that require a proxy cannot load remote images.
- A `blob:` URL shares the app's origin, so remote SVG is refused. Supporting it needs a separate-origin presentation such as a custom URI scheme.
- Images are decoded only by the WebView renderer, never in the Rust process.
- On Linux, `native-tls` links the system OpenSSL.

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
