# Byte and Grammar Boundaries

The `bytes/` fixtures preserve exact byte sequences through attributes in the
repository's `.gitattributes`. `invalid-utf8.md` is deliberately not a valid
UTF-8 document; it must be opened through the application rather than repaired
by an editor that rewrites it on save.

The `limits/` fixtures exercise the normative CommonMark reference-label length
boundary as an adjacent 999/1000-character pair, and line lengths that a
viewport-wrapping prose surface has to accommodate.
