# Detection and Visualization Mappings

bmd detects invisible, non-rendering, and ambiguous Unicode characters in markdown source and replaces them with visible styled glyphs. Characters are preserved in source — never stripped. The user sees what is actually in their document.

## Design Decisions

- **Reveal, don't strip.** Source bytes are never modified. Glyphs are visual replacements in rendered output only.
- **Theme-controlled styling.** All detected characters use a single theme-controlled highlight style (fg/bg). The glyph communicates the category.
- **Context-aware pass-through.** ZWJ inside emoji sequences, ZWNJ between joining-script morphemes, and variation selectors on emoji bases are legitimate and not flagged. Context is determined by UTS #39 Section 4 joiner context rules. The same codepoint in Latin/ASCII context is flagged.
- **Atomic regions.** Multi-codepoint sequences that form a logical unit (emoji sequences, ANSI escapes, bidi pairs, flood runs) are treated as indivisible. Flag the whole region or none of it.
- **Aggregation for floods.** Consecutive runs of the same category collapse into count notation (e.g. 🏷×120) to prevent output explosion from payload-style attacks.
- **AI watermarks** use distinct glyphs per role: ⌜ opener, ⌟ closer, · separator, ◇ unobserved.
- **⊘** used for PDF, deprecated formats, and noncharacters. PDI has ⊝.
- **C1 controls share ⌧** — no individual glyphs exist in Unicode for C1. Shared glyph is acceptable; differentiation via tooltip/hover in browser.
- **Whitespace lookalikes** — NBSP and Narrow NBSP use ⍽ (open box with baseline); all other whitespace variants use ␣. Two glyphs, not one per variant.
- **Confusables** — no substitution glyph. Confusable detection uses underline styling in browser and bracketed annotation in terminal. Context-dependent and heuristic; deferred to follow-on research for library selection.
- **Emoji ZWJ sequences** — Ghostty does not render U+200D; composed emoji (family, couple, profession) may not display as single glyphs. These still pass through as atomic regions but the rendering depends on terminal/font support.
- **Unbalanced bidi/annotation controls** extend to end-of-block. A lone RLO without PDF, or U+FFF9 without U+FFFB, highlights from the control character to the end of the containing block (paragraph, heading, list item).
- **ANSI sequences** render with visible parameters: ESC is replaced by its glyph (␛) and the rest of the sequence is shown literally (e.g. `␛[31m`). Maximum sequence length is 256 bytes; longer sequences are treated as normal text.
- **Joiner context** uses UTS #39 Section 4 contextual rules for ZWJ/ZWNJ pass-through decisions, not a bespoke heuristic.
- **Nested atomic regions** use outer-wins: the outermost region is the atomic unit. Inner content renders with individual glyphs but selection/deletion operates on the outer region.

## Glyph Map Schema

All glyph map tables use this schema:

`OK | Codepoint | Name | Raw | Glyph | ASCII | Notes`

- **OK** — user review mark (y/n/?/~/!/o/p)
- **Codepoint** — Unicode codepoint or range
- **Name** — standard Unicode name or abbreviation
- **Raw** — the actual Unicode character(s) between backticks. If the character corrupts layout, shown as `-`
- **Glyph** — what bmd renders in UTF-8 mode
- **ASCII** — what bmd renders in ASCII mode (bracketed abbreviation). All output bytes must be in the ASCII range (U+0020–U+007E). Non-ASCII characters that pass through in UTF-8 mode require an ASCII-safe representation. `-` means the character is already ASCII and passes through unchanged.
- **Notes** — exceptions, context rules, behavior

## Zero-Width Controls

| OK | Codepoint | Name                         | Raw | Glyph | ASCII    | Notes                                     |
|----|-----------|------------------------------|-----|-------|----------|--------------------------------------------|
| y  | U+200B    | Zero Width Space (ZWSP)      | -   | ␣     | [ZWSP]   |                                            |
| y  | U+200C    | Zero Width Non-Joiner (ZWNJ) | -   | ‹⁄›   | [ZWNJ]   | Pass-through per UTS #39 §4 joiner context |
| y  | U+200D    | Zero Width Joiner (ZWJ)      | -   | ⊕     | [ZWJ]    | Pass-through per UTS #39 §4 joiner context |
| y  | U+2060    | Word Joiner (WJ)             | -   | ⊹     | [WJ]     |                                            |
| y  | U+FEFF    | BOM / ZWNBSP                 | -   | ⍊     | [BOM]    | Only flagged when not at byte 0            |

## Bidi Overrides and Embeddings

| OK | Codepoint | Name                             | Raw | Glyph | ASCII  | Closer | Notes                   |
|----|-----------|----------------------------------|-----|-------|--------|--------|-------------------------|
| y  | U+202A    | Left-to-Right Embedding (LRE)    | -   | ⊳⊳    | [LRE]  | U+202C | Reorders displayed text |
| y  | U+202B    | Right-to-Left Embedding (RLE)    | -   | ⊲⊲    | [RLE]  | U+202C | Reorders displayed text |
| y  | U+202C    | Pop Directional Formatting (PDF) | -   | ⊘     | [PDF]  | -      |                         |
| y  | U+202D    | Left-to-Right Override (LRO)     | -   | ⊳!    | [LRO]  | U+202C | Reorders displayed text |
| y  | U+202E    | Right-to-Left Override (RLO)     | -   | ⊲!    | [RLO]  | U+202C | Reorders displayed text |

## Bidi Marks and Isolates

| OK | Codepoint | Name                           | Raw | Glyph | ASCII  | Closer | Notes                      |
|----|-----------|--------------------------------|-----|-------|--------|--------|----------------------------|
| y  | U+200E    | Left-to-Right Mark (LRM)       | -   | ⊳     | [LRM]  | -      | Legitimate in RTL contexts |
| y  | U+200F    | Right-to-Left Mark (RLM)       | -   | ⊲     | [RLM]  | -      | Legitimate in RTL contexts |
| y  | U+2066    | Left-to-Right Isolate (LRI)    | -   | ⊳⃝    | [LRI]  | U+2069 |                            |
| y  | U+2067    | Right-to-Left Isolate (RLI)    | -   | ⊲⃝    | [RLI]  | U+2069 |                            |
| y  | U+2068    | First Strong Isolate (FSI)     | -   | ⊙     | [FSI]  | U+2069 |                            |
| y  | U+2069    | Pop Directional Isolate (PDI)  | -   | ⊝     | [PDI]  | -      |                            |

## Tag Characters

| OK | Codepoint         | Name                     | Raw | Glyph | ASCII    | Notes                  |
|----|-------------------|--------------------------|-----|-------|----------|------------------------|
| o  | U+E0000           | Reserved (Tags block)    | -   | 🏷    | [TAG]    | Not assigned but in codepoint space |
| y  | U+E0001           | Language Tag             | -   | 🏷    | [TAG]    | Deprecated but present |
| o  | U+E0020           | Tag Space                | -   | 🏷    | [TAG]    |                        |
| o  | U+E0021           | Tag Exclamation Mark     | -   | 🏷    | [TAG]    |                        |
| o  | U+E0022           | Tag Quotation Mark       | -   | 🏷    | [TAG]    |                        |
| o  | U+E0023           | Tag Number Sign          | -   | 🏷    | [TAG]    |                        |
| o  | U+E0024           | Tag Dollar Sign          | -   | 🏷    | [TAG]    |                        |
| o  | U+E0025           | Tag Percent Sign         | -   | 🏷    | [TAG]    |                        |
| o  | U+E0026           | Tag Ampersand            | -   | 🏷    | [TAG]    |                        |
| o  | U+E0027           | Tag Apostrophe           | -   | 🏷    | [TAG]    |                        |
| o  | U+E0028           | Tag Left Parenthesis     | -   | 🏷    | [TAG]    |                        |
| o  | U+E0029           | Tag Right Parenthesis    | -   | 🏷    | [TAG]    |                        |
| o  | U+E002A           | Tag Asterisk             | -   | 🏷    | [TAG]    |                        |
| o  | U+E002B           | Tag Plus Sign            | -   | 🏷    | [TAG]    |                        |
| o  | U+E002C           | Tag Comma                | -   | 🏷    | [TAG]    |                        |
| o  | U+E002D           | Tag Hyphen-Minus         | -   | 🏷    | [TAG]    |                        |
| o  | U+E002E           | Tag Full Stop            | -   | 🏷    | [TAG]    |                        |
| o  | U+E002F           | Tag Solidus              | -   | 🏷    | [TAG]    |                        |
| o  | U+E0030           | Tag Digit Zero           | -   | 🏷    | [TAG]    |                        |
| o  | U+E0031           | Tag Digit One            | -   | 🏷    | [TAG]    |                        |
| o  | U+E0032           | Tag Digit Two            | -   | 🏷    | [TAG]    |                        |
| o  | U+E0033           | Tag Digit Three          | -   | 🏷    | [TAG]    |                        |
| o  | U+E0034           | Tag Digit Four           | -   | 🏷    | [TAG]    |                        |
| o  | U+E0035           | Tag Digit Five           | -   | 🏷    | [TAG]    |                        |
| o  | U+E0036           | Tag Digit Six            | -   | 🏷    | [TAG]    |                        |
| o  | U+E0037           | Tag Digit Seven          | -   | 🏷    | [TAG]    |                        |
| o  | U+E0038           | Tag Digit Eight          | -   | 🏷    | [TAG]    |                        |
| o  | U+E0039           | Tag Digit Nine           | -   | 🏷    | [TAG]    |                        |
| o  | U+E003A           | Tag Colon                | -   | 🏷    | [TAG]    |                        |
| o  | U+E003B           | Tag Semicolon            | -   | 🏷    | [TAG]    |                        |
| o  | U+E003C           | Tag Less-Than Sign       | -   | 🏷    | [TAG]    |                        |
| o  | U+E003D           | Tag Equals Sign          | -   | 🏷    | [TAG]    |                        |
| o  | U+E003E           | Tag Greater-Than Sign    | -   | 🏷    | [TAG]    |                        |
| o  | U+E003F           | Tag Question Mark        | -   | 🏷    | [TAG]    |                        |
| o  | U+E0040           | Tag Commercial At        | -   | 🏷    | [TAG]    |                        |
| o  | U+E0041–E005A     | Tag Latin Capitals A–Z   | -   | 🏷    | [TAG]    | 26 codepoints          |
| o  | U+E005B           | Tag Left Square Bracket  | -   | 🏷    | [TAG]    |                        |
| o  | U+E005C           | Tag Reverse Solidus      | -   | 🏷    | [TAG]    |                        |
| o  | U+E005D           | Tag Right Square Bracket | -   | 🏷    | [TAG]    |                        |
| o  | U+E005E           | Tag Circumflex Accent    | -   | 🏷    | [TAG]    |                        |
| o  | U+E005F           | Tag Low Line             | -   | 🏷    | [TAG]    |                        |
| o  | U+E0060           | Tag Grave Accent         | -   | 🏷    | [TAG]    |                        |
| o  | U+E0061–E007A     | Tag Latin Smalls a–z     | -   | 🏷    | [TAG]    | 26 codepoints          |
| o  | U+E007B           | Tag Left Curly Bracket   | -   | 🏷    | [TAG]    |                        |
| o  | U+E007C           | Tag Vertical Line        | -   | 🏷    | [TAG]    |                        |
| o  | U+E007D           | Tag Right Curly Bracket  | -   | 🏷    | [TAG]    |                        |
| o  | U+E007E           | Tag Tilde                | -   | 🏷    | [TAG]    |                        |
| y  | U+E007F           | Cancel Tag               | -   | 🏷⊘   | [/TAG]   |                        |

## C0 Controls

| OK | Codepoint | Name                       | Raw | Glyph | ASCII | Notes                        |
|----|-----------|----------------------------|-----|-------|-------|------------------------------|
| y  | U+0000    | NUL (Null)                 | -   | ␀     | [NUL] |                              |
| y  | U+0001    | SOH (Start of Heading)     | -   | ␁     | [SOH] |                              |
| y  | U+0002    | STX (Start of Text)        | -   | ␂     | [STX] |                              |
| y  | U+0003    | ETX (End of Text)          | -   | ␃     | [ETX] |                              |
| y  | U+0004    | EOT (End of Transmission)  | -   | ␄     | [EOT] |                              |
| y  | U+0005    | ENQ (Enquiry)              | -   | ␅     | [ENQ] |                              |
| y  | U+0006    | ACK (Acknowledge)          | -   | ␆     | [ACK] |                              |
| y  | U+0007    | BEL (Bell)                 | -   | ␇     | [BEL] |                              |
| y  | U+0008    | BS (Backspace)             | -   | ␈     | [BS]  |                              |
| p  | U+0009    | HT (Horizontal Tab)        | -   | -     | -     | Pass-through                 |
| p  | U+000A    | LF (Line Feed)             | -   | -     | -     | Pass-through                 |
| y  | U+000B    | VT (Vertical Tab)          | -   | ␋     | [VT]  |                              |
| y  | U+000C    | FF (Form Feed)             | -   | ␌     | [FF]  |                              |
| p  | U+000D    | CR (Carriage Return)       | -   | -     | -     | Pass-through                 |
| y  | U+000E    | SO (Shift Out)             | -   | ␎     | [SO]  |                              |
| y  | U+000F    | SI (Shift In)              | -   | ␏     | [SI]  |                              |
| y  | U+0010    | DLE (Data Link Escape)     | -   | ␐     | [DLE] |                              |
| y  | U+0011    | DC1 (Device Control One)   | -   | ␑     | [DC1] |                              |
| y  | U+0012    | DC2 (Device Control Two)   | -   | ␒     | [DC2] |                              |
| y  | U+0013    | DC3 (Device Control Three) | -   | ␓     | [DC3] |                              |
| y  | U+0014    | DC4 (Device Control Four)  | -   | ␔     | [DC4] |                              |
| y  | U+0015    | NAK (Negative Acknowledge) | -   | ␕     | [NAK] |                              |
| y  | U+0016    | SYN (Synchronous Idle)     | -   | ␖     | [SYN] |                              |
| y  | U+0017    | ETB (End of Trans. Block)  | -   | ␗     | [ETB] |                              |
| y  | U+0018    | CAN (Cancel)               | -   | ␘     | [CAN] |                              |
| y  | U+0019    | EM (End of Medium)         | -   | ␙     | [EM]  |                              |
| y  | U+001A    | SUB (Substitute)           | -   | ␚     | [SUB] |                              |
| y  | U+001B    | ESC (Escape)               | -   | ␛     | [ESC] | ANSI escape injection vector |
| y  | U+001C    | FS (File Separator)        | -   | ␜     | [FS]  |                              |
| y  | U+001D    | GS (Group Separator)       | -   | ␝     | [GS]  |                              |
| y  | U+001E    | RS (Record Separator)      | -   | ␞     | [RS]  |                              |
| y  | U+001F    | US (Unit Separator)        | -   | ␟     | [US]  |                              |
| y  | U+007F    | DEL (Delete)               | -   | ␡     | [DEL] |                              |

## C1 Controls

| OK | Codepoint   | Name                        | Raw | Glyph | ASCII | Notes                                             |
|----|-------------|-----------------------------|-----|-------|-------|----------------------------------------------------|
| o  | U+0080–009F | C1 control range (32 chars) | -   | ⌧     | [C1]  | Shared glyph, no individual Unicode symbols exist  |

## ANSI Escape Sequences

| OK | Pattern                                    | Name         | Glyph Example | ASCII Example    | Closer           | Notes                                          |
|----|--------------------------------------------|--------------|----------------|------------------|------------------|-------------------------------------------------|
| y  | U+001B + `[` + params + letter             | SGR sequence | `␛[31m`        | `[ESC][31m`      | `[a-zA-Z]`       | ESC replaced by ␛, params shown literally       |
| y  | U+001B + `]` + payload + ST               | OSC sequence | `␛]8;…`        | `[ESC]]8;…`      | ST (`␛\\` / BEL) | ESC replaced by ␛, payload shown literally      |
| y  | U+001B + `[` + params + intermediate + final | CSI sequence | `␛[2J`         | `[ESC][2J`       | `[@-~]`          | ESC replaced by ␛, params shown literally       |

Max sequence length: 256 bytes. Sequences exceeding this limit are treated as normal text. Sequences cannot span block boundaries; a partial sequence at end-of-block is flagged as individual control characters.

## Whitespace Lookalikes

| OK | Codepoint | Name                      | Raw  | Glyph | ASCII   | Notes                         |
|----|-----------|---------------------------|------|-------|---------|-------------------------------|
| o  | U+00A0    | No-Break Space (NBSP)     | ` `  | ⍽     | [NBSP]  | Common in copy-paste from web |
| o  | U+1680    | Ogham Space Mark          | ` `  | ␣     | [WSP]   |                               |
| o  | U+2000    | En Quad                   | ` `  | ␣     | [WSP]   |                               |
| o  | U+2001    | Em Quad                   | ` `  | ␣     | [WSP]   |                               |
| o  | U+2002    | En Space                  | ` `  | ␣     | [WSP]   |                               |
| o  | U+2003    | Em Space                  | ` `  | ␣     | [WSP]   |                               |
| o  | U+2004    | Three-Per-Em Space        | ` `  | ␣     | [WSP]   |                               |
| o  | U+2005    | Four-Per-Em Space         | ` `  | ␣     | [WSP]   |                               |
| o  | U+2006    | Six-Per-Em Space          | ` `  | ␣     | [WSP]   |                               |
| o  | U+2007    | Figure Space              | ` `  | ␣     | [WSP]   |                               |
| o  | U+2008    | Punctuation Space         | ` `  | ␣     | [WSP]   |                               |
| o  | U+2009    | Thin Space                | ` `  | ␣     | [WSP]   |                               |
| o  | U+200A    | Hair Space                | ` `  | ␣     | [WSP]   |                               |
| o  | U+202F    | Narrow No-Break Space     | ` `  | ⍽     | [NBSP]  |                               |
| o  | U+205F    | Medium Mathematical Space | ` `  | ␣     | [WSP]   |                               |
| o  | U+3000    | Ideographic Space         | `　` | ␣     | [WSP]   | CJK full-width space          |

## Private Use Area

| OK | Codepoint       | Name                   | Raw | Glyph | ASCII  | Closer | Notes                                                  |
|----|-----------------|------------------------|-----|-------|--------|--------|---------------------------------------------------------|
| y  | U+E000–E1FF     | BMP PUA (general)      | -   | ⟐     | [PUA]  | -      |                                                         |
| y  | U+E200          | AI Watermark opener    | -   | ⌜     | [AI<]  | U+E201 | Precedes `cite` refs; acts as citation open delimiter   |
| y  | U+E201          | AI Watermark closer    | -   | ⌟     | [AI>]  | -      | Follows last digit; acts as citation close delimiter    |
| y  | U+E202          | AI Watermark separator | -   | ·     | [AI.]  | -      | U+00B7 Middle Dot                                       |
| y  | U+E203–E2FF     | AI Watermark (other)   | -   | ◇     | [AI?]  | -      | Unobserved in samples                                   |
| y  | U+E300–F8FF     | BMP PUA (remainder)    | -   | ⟐     | [PUA]  | -      |                                                         |
| o  | U+F0000–FFFFD   | Supplementary PUA-A    | -   | ⟐     | [PUA]  | -      |                                                         |
| o  | U+100000–10FFFD | Supplementary PUA-B    | -   | ⟐     | [PUA]  | -      |                                                         |

## Variation Selectors

| OK | Codepoint     | Name                       | Raw  | Glyph | ASCII | Notes                                     |
|----|---------------|----------------------------|------|-------|-------|--------------------------------------------|
| y  | U+FE00        | VS1 (Variation Selector 1) | `︀`  | ⬡     | [VS]  | Not flagged when modifying emoji base char |
| y  | U+FE01        | VS2                        | `︁`  | ⬡     | [VS]  |                                            |
| y  | U+FE02        | VS3                        | `︂`  | ⬡     | [VS]  |                                            |
| o  | U+FE03–FE0D   | VS4–VS14                   | -    | ⬡     | [VS]  | 11 codepoints                              |
| o  | U+FE0E        | VS15 (Text Presentation)   | `︎`  | ⬡     | [VS]  | Forces text display of preceding char      |
| o  | U+FE0F        | VS16 (Emoji Presentation)  | `️`  | ⬡     | [VS]  | Forces emoji display of preceding char     |
| o  | U+E0100–E01EF | VS17–VS256 (Supplement)    | -    | ⬡     | [VS]  | Aggregates as ⬡×N for floods               |

## Interlinear Annotations

| OK | Codepoint | Name                              | Raw | Glyph | ASCII  | Closer | Notes |
|----|-----------|-----------------------------------|-----|-------|--------|--------|-------|
| y  | U+FFF9    | Interlinear Annotation Anchor     | -   | ⟦ₐ⟧   | [ANN<] | U+FFFB |       |
| y  | U+FFFA    | Interlinear Annotation Separator  | -   | ⟦ₛ⟧   | [ANN|] | U+FFFB |       |
| o  | U+FFFB    | Interlinear Annotation Terminator | -   | ⟦ₜ⟧   | [ANN>] | -      |       |

## Deprecated Format Characters

| OK | Codepoint | Name                         | Raw | Glyph | ASCII  | Notes |
|----|-----------|------------------------------|-----|-------|--------|-------|
| o  | U+206A    | Inhibit Symmetric Swapping   | -   | ⊘     | [DEP]  |       |
| o  | U+206B    | Activate Symmetric Swapping  | -   | ⊘     | [DEP]  |       |
| o  | U+206C    | Inhibit Arabic Form Shaping  | -   | ⊘     | [DEP]  |       |
| o  | U+206D    | Activate Arabic Form Shaping | -   | ⊘     | [DEP]  |       |
| o  | U+206E    | National Digit Shapes        | -   | ⊘     | [DEP]  |       |
| o  | U+206F    | Nominal Digit Shapes         | -   | ⊘     | [DEP]  |       |

## Special and Noncharacters

| OK | Codepoint   | Name                         | Raw  | Glyph | ASCII  | Notes                           |
|----|-------------|------------------------------|------|-------|--------|---------------------------------|
| o  | U+FFFE      | Noncharacter (BOM reversed)  | -    | ⊘     | [NUL]  |                                 |
| o  | U+FFFF      | Noncharacter                 | -    | ⊘     | [NUL]  |                                 |
| o  | U+FDD0–FDEF | Noncharacters                | -    | ⊘     | [NUL]  | 32 noncharacters                |
| y  | U+FFFC      | Object Replacement Character | `￼` | ⎕     | [OBJ]  | Placeholder for embedded object |
| y  | U+FFFD      | Replacement Character        | `�` | �     | [?]    | Already visible                 |
| y  | U+2028      | Line Separator               | -    | ␤     | [LS]   | Invisible paragraph break       |
| y  | U+2029      | Paragraph Separator          | -    | ¶     | [PS]   |                                 |

## Combining Mark Floods

| OK | Codepoint | Name                           | Raw | Glyph | ASCII    | Notes                  |
|----|-----------|--------------------------------|-----|-------|----------|------------------------|
| y  | (pattern) | 3+ combining marks on one base | -   | ◌×N   | [Mn]xN   | Threshold configurable |

## Confusables

No substitution glyph. These characters render visibly — the problem is they look like something else. Detection uses underline styling (browser) and bracketed annotation (terminal). These are reference examples; the full confusable set comes from TR39 `confusables.txt` at implementation time.

| OK | Codepoint   | Name                | Raw  | Glyph | ASCII       | Notes                    |
|----|-------------|---------------------|------|-------|-------------|--------------------------|
| P  | U+0370–03FF | Greek and Coptic    | `Δ`  | -     | [U+XXXX]    |                          |
| P  | U+0400–04FF | Cyrillic            | `Б`  | -     | [U+XXXX]    |                          |
| P  | U+0500–052F | Cyrillic Supplement | `Ԁ`  | -     | [U+XXXX]    |                          |
| P  | U+0530–058F | Armenian            | `Ա`  | -     | [U+XXXX]    |                          |
| P  | U+10A0–10FF | Georgian            | `Ⴀ`  | -     | [U+XXXX]    |                          |
| P  | U+FF01–FF5E | Fullwidth Latin     | `Ａ` | -     | [U+XXXX]    | Fullwidth ASCII variants |

## Dash and Hyphen Confusables

| OK | Codepoint | Name                   | Raw  | Glyph | ASCII    | Notes                            |
|----|-----------|------------------------|------|-------|----------|----------------------------------|
| o  | U+002D    | Hyphen-Minus           | `-`  | -     | -        | Pass-through (standard ASCII)    |
| o  | U+2010    | Hyphen                 | `‐`  | -     | [U+2010] | Confusable with U+002D           |
| o  | U+2011    | Non-Breaking Hyphen    | `‑`  | -     | [U+2011] | Confusable with U+002D, no break |
| o  | U+2012    | Figure Dash            | `‒`  | -     | [U+2012] | Confusable with U+002D           |
| o  | U+2013    | En Dash                | `–`  | -     | [U+2013] | Confusable with U+002D           |
| o  | U+2014    | Em Dash                | `—`  | -     | [U+2014] | Confusable with U+002D           |
| o  | U+2015    | Horizontal Bar         | `―`  | -     | [U+2015] | Confusable with U+002D           |
| o  | U+2212    | Minus Sign             | `−`  | -     | [U+2212] | Confusable with U+002D           |
| o  | U+FE58    | Small Em Dash          | `﹘` | -     | [U+FE58] | Confusable with U+002D           |
| o  | U+FE63    | Small Hyphen-Minus     | `﹣` | -     | [U+FE63] | Confusable with U+002D           |
| o  | U+FF0D    | Fullwidth Hyphen-Minus | `－` | -     | [U+FF0D] | Confusable with U+002D, 2-wide   |

## Pass-Through

| OK | Codepoint                         | Name                   | Raw  | Glyph        | ASCII        | Notes                           |
|----|-----------------------------------|------------------------|------|--------------|--------------|----------------------------------|
| y  | emoji + (U+200D + emoji)+         | Emoji ZWJ family       | -    | 👨⊕👩⊕👧⊕👦 | [U+XXXX]...  | Show base emoji joined by ⊕      |
| y  | emoji + U+200D + emoji            | Emoji ZWJ couple       | -    | 👩⊕❤️⊕👨   | [U+XXXX]...  | Show base emoji joined by ⊕      |
| y  | emoji + U+200D + emoji            | Emoji ZWJ profession   | -    | 👩⊕🔬       | [U+XXXX]...  | Show base emoji joined by ⊕      |
| p  | emoji + U+1F3FB–1F3FF             | Emoji skin tone        | 👋🏽 | -            | [U+XXXX]     |                                  |
| p  | 🏴 + tags + U+E007F               | Emoji flag tag sequence | 🏴󠁧󠁢󠁳󠁣󠁴󠁿  | -            | [U+XXXX]...  |                                  |
| p  | digit + U+FE0F + U+20E3           | Emoji keycap           | 3️⃣   | -            | [U+XXXX]     |                                  |
| p  | base + U+FE0F                     | Emoji presentation     | ❤️   | -            | [U+XXXX]     |                                  |
| p  | U+1F1E6–1F1FF pair                | Emoji regional flag    | 🇺🇸  | -            | [U+XXXX]     |                                  |
| p  | CJK range                         | CJK text               | 日本語 | -          | [U+XXXX]     |                                  |
| p  | Arabic/Hebrew range               | RTL script             | مرحبا | -          | [U+XXXX]     |                                  |
| p  | Arabic/Hebrew range               | RTL script             | עברית | -          | [U+XXXX]     |                                  |
| p  | base + U+FE0F                     | VS on emoji base       | ☺️   | -            | [U+XXXX]     |                                  |
| p  | U+0009                            | TAB                    | -    | -            | -            |                                  |
| p  | U+000A                            | LF                     | -    | -            | -            |                                  |
| p  | U+000D                            | CR                     | -    | -            | -            |                                  |
| p  | U+FEFF                            | BOM at byte 0          | -    | -            | -            | Only at offset 0                 |
| p  | U+0020–U+007E                     | Standard ASCII         | -    | -            | -            |                                  |

## Aggregation Rules

| Pattern                         | Threshold | Glyph | ASCII     |
|---------------------------------|-----------|-------|-----------|
| Consecutive tag chars           | 2+        | 🏷×N  | [TAG]xN   |
| Consecutive variation selectors | 2+        | ⬡×N  | [VS]xN    |
| Combining marks on one base     | 3+        | ◌×N  | [Mn]xN    |
| Consecutive PUA chars           | 2+        | ⟐×N  | [PUA]xN   |
| Consecutive whitespace variants | 2+        | ␣×N  | [WSP]xN   |

## Atomic Regions

Multi-codepoint sequences that form a single logical unit. The detector treats these as indivisible — flag the whole region or none of it, never individual codepoints within.

**Nesting:** Outer region wins. When regions nest (e.g. a bidi pair containing tag chars), the outermost region is the atomic unit. Inner content renders with individual glyphs but selection/deletion operates on the outer region.

**Unbalanced pairs:** When an opening control (bidi override/isolate, interlinear anchor) has no matching closer, the region extends to end-of-block (paragraph, heading, list item). The block boundary acts as an implicit terminator.

| Region Type              | Pattern                                         | Behavior                              | Example                           |
|--------------------------|-------------------------------------------------|---------------------------------------|------------------------------------|
| ANSI SGR sequence        | U+001B + [ + params + terminator letter         | Styled as single unit; ≤256 bytes     | ␛[31m                             |
| ANSI OSC sequence        | U+001B + ] + payload + ST                       | Styled as single unit; ≤256 bytes     | ␛]8;;url␛\\                       |
| ANSI CSI sequence        | U+001B + [ + params + intermediate + final      | Styled as single unit; ≤256 bytes     | ␛[2J                              |
| Bidi isolate pair        | U+2066/2067/2068 + content + U+2069            | Flag as single balanced region        | LRI...PDI                         |
| Bidi override pair       | U+202A–202E + content + U+202C                 | Flag as single balanced region        | RLO...PDF                         |
| Bidi reorder spoof       | RLO/LRO + visible text + PDF                   | Flag entire span including visible    | ⊲! access = "admin" ⊘             |
| Bidi comment spoof       | bidi controls inside code comment/string        | Flag control + affected visible text  | /* ⊲! if (admin) ⊘ */             |
| Tag char run             | U+E0020–E007E consecutive                      | Aggregate into 🏷×N                    | 120 tags → 🏷×120                  |
| Tag smuggled payload     | visible text + tag char run encoding hidden msg | Flag visible anchor + decoded payload | `safe-lib` 🏷×120                  |
| Variation selector flood | U+FE00–FE0F or U+E0100–E01EF consecutive       | Aggregate into ⬡×N                    | 240 selectors → ⬡×240             |
| VS encoded payload       | visible base + VS run encoding hidden data      | Flag base + VS flood as single region | A ⬡×240                           |
| PUA run                  | U+E000–F8FF consecutive                        | Aggregate into ⟐×N                    | 80 PUA chars → ⟐×80               |
| PUA steganographic run   | visible text interleaved with PUA encoding      | Flag visible + PUA as single region   | hello ⟐×40 world ⟐×40             |
| Combining mark flood     | base + 3+ combining marks (Mn)                 | Aggregate into ◌×N                    | a + 45 marks → ◌×45               |
| Homoglyph substitution   | Latin-like chars from mixed scripts in one span | Flag entire span as single region     | pаypal (Cyrillic а in Latin span) |
| ZWNJ/ZWJ outside script  | U+200C/200D between Latin/ASCII chars           | Flag join char + adjacent chars       | pass‌word (ZWNJ in Latin)          |
| Interlinear annotation   | U+FFF9 + content + U+FFFA + ann + U+FFFB       | Flag entire annotated span            | ⟦ₐ⟧ text ⟦ₛ⟧ hidden ⟦ₜ⟧          |
| Unbalanced bidi          | RLO/LRO/RLE/LRE/isolate without closer         | Highlight control + rest of block     | ⊲! text to end of block           |
| Unbalanced annotation    | U+FFF9 without U+FFFB                           | Highlight anchor + rest of block      | ⟦ₐ⟧ text to end of block          |

## Catch-All: All Other Non-ASCII

| OK | Codepoint | Name | Raw | Glyph | ASCII | Notes |
|----|-----------|------|-----|-------|-------|-------|
| p  | U+0080+   | Any non-ASCII not covered above | - | - | [U+XXXX] | Pass-through in UTF-8; ASCII-safe bracket notation. Scanner catch-all. |

This makes the contract explicit: EVERY codepoint > U+007E that doesn't match a specific category gets the default `[U+XXXX]` treatment in ASCII mode and pass-through in UTF-8 mode.

## Mark Legend

| Mark | Meaning                                        |
|------|------------------------------------------------|
| y    | Approved as highlighted char/region            |
| o    | Approved as overloaded highlighted char/region |
| p    | Approved as pass-thru                          |
| P    | Approved as pass-thru highlighted char/region  |
