[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [parsers/dom/Tokenizer](../README.md) / Tokenizer

# Class: Tokenizer

Defined in: src/parsers/dom/Tokenizer.ts:168

Tokenizer class

## Constructors

### Constructor

> __new Tokenizer__(`input`): `Tokenizer`

Defined in: src/parsers/dom/Tokenizer.ts:191

Create a new Tokenizer

#### Parameters

##### input

`string` \| `null` \| `undefined`

The wiki markup to tokenize

#### Returns

`Tokenizer`

## Properties

### column

> __column__: `number`

Defined in: src/parsers/dom/Tokenizer.ts:182

Current column number

***

### input

> `protected` __input__: `string`

Defined in: src/parsers/dom/Tokenizer.ts:170

Input string

***

### line

> __line__: `number`

Defined in: src/parsers/dom/Tokenizer.ts:179

Current line number

***

### position

> __position__: `number`

Defined in: src/parsers/dom/Tokenizer.ts:176

Current position in input

## Methods

### createToken()

> __createToken__(`type`, `value`, `metadata?`): [`Token`](../interfaces/Token.md)

Defined in: src/parsers/dom/Tokenizer.ts:391

Create a token with current position information

#### Parameters

##### type

`string`

Token type from TokenType enum

##### value

`string`

Token value

##### metadata?

[`TokenMetadata`](../interfaces/TokenMetadata.md) = `{}`

Additional token metadata

#### Returns

[`Token`](../interfaces/Token.md)

The created token

***

### expect()

> __expect__(`str`): `void`

Defined in: src/parsers/dom/Tokenizer.ts:464

Expect a specific string at current position, throw if not found

#### Parameters

##### str

`string`

String to expect

#### Returns

`void`

#### Throws

Error if string not found

***

### getPosition()

> __getPosition__(): [`PositionInfo`](../interfaces/PositionInfo.md)

Defined in: src/parsers/dom/Tokenizer.ts:376

Get current position information

#### Returns

[`PositionInfo`](../interfaces/PositionInfo.md)

Position information

***

### isEOF()

> __isEOF__(): `boolean`

Defined in: src/parsers/dom/Tokenizer.ts:360

Check if we're at the end of the input

#### Returns

`boolean`

True if at EOF

***

### isLineStart()

> __isLineStart__(): `boolean`

Defined in: src/parsers/dom/Tokenizer.ts:368

Check if we're at the start of a line

#### Returns

`boolean`

True if at line start

***

### match()

> __match__(`str`, `consume?`): `boolean`

Defined in: src/parsers/dom/Tokenizer.ts:447

Match a specific string at current position

#### Parameters

##### str

`string`

String to match

##### consume?

`boolean` = `false`

Whether to consume if matched

#### Returns

`boolean`

True if matched

***

### nextChar()

> __nextChar__(): `string` \| `null`

Defined in: src/parsers/dom/Tokenizer.ts:221

Get the next character and advance position

#### Returns

`string` \| `null`

Next character or null if at EOF

***

### nextToken()

> __nextToken__(): [`Token`](../interfaces/Token.md) \| `null`

Defined in: src/parsers/dom/Tokenizer.ts:521

Get the next token from the input

#### Returns

[`Token`](../interfaces/Token.md) \| `null`

Next token or null if EOF

***

### parseBoldToken()

> __parseBoldToken__(): [`Token`](../interfaces/Token.md)

Defined in: src/parsers/dom/Tokenizer.ts:863

Parse bold: __text__

#### Returns

[`Token`](../interfaces/Token.md)

Bold token

***

### parseBracketDirective()

> __parseBracketDirective__(): [`Token`](../interfaces/Token.md)

Defined in: src/parsers/dom/Tokenizer.ts:671

Parse bracket directive [{...}]
Determines type based on content:

- [{$...}] → Variable
- [{SET ...}] → Metadata
- [{...}] → Plugin

#### Returns

[`Token`](../interfaces/Token.md)

Directive token

***

### parseCodeBlockToken()

> __parseCodeBlockToken__(): [`Token`](../interfaces/Token.md)

Defined in: src/parsers/dom/Tokenizer.ts:917

Parse code block: {{{code}}}

#### Returns

[`Token`](../interfaces/Token.md)

Code block token

***

### parseCodeInlineToken()

> __parseCodeInlineToken__(): [`Token`](../interfaces/Token.md)

Defined in: src/parsers/dom/Tokenizer.ts:899

Parse inline code: {{text}}

#### Returns

[`Token`](../interfaces/Token.md)

Code inline token

***

### parseCommentToken()

> __parseCommentToken__(): [`Token`](../interfaces/Token.md)

Defined in: src/parsers/dom/Tokenizer.ts:935

Parse HTML comment: <!-- comment -->

#### Returns

[`Token`](../interfaces/Token.md)

Comment token

***

### parseEscapedToken()

> __parseEscapedToken__(): [`Token`](../interfaces/Token.md)

Defined in: src/parsers/dom/Tokenizer.ts:620

Parse escaped text: [[text]
Syntax: [[content] where [[ outputs literal [
Everything between [[ and ] is treated as plain text
Example: [[{$variable}] renders as literal [{$variable}]

#### Returns

[`Token`](../interfaces/Token.md)

Escaped token

***

### parseHeadingToken()

> __parseHeadingToken__(): [`Token`](../interfaces/Token.md)

Defined in: src/parsers/dom/Tokenizer.ts:789

Parse heading: !!!, !!, !

#### Returns

[`Token`](../interfaces/Token.md)

Heading token

***

### parseItalicToken()

> __parseItalicToken__(): [`Token`](../interfaces/Token.md)

Defined in: src/parsers/dom/Tokenizer.ts:881

Parse italic: ''text''

#### Returns

[`Token`](../interfaces/Token.md)

Italic token

***

### parseListItemToken()

> __parseListItemToken__(): [`Token`](../interfaces/Token.md)

Defined in: src/parsers/dom/Tokenizer.ts:815

Parse list item: *, #, **, ##, etc.

#### Returns

[`Token`](../interfaces/Token.md)

List item token

***

### parseMetadataToken()

> __parseMetadataToken__(`pos`): [`Token`](../interfaces/Token.md)

Defined in: src/parsers/dom/Tokenizer.ts:717

Parse metadata: [{SET name=value}]
Called after [{ has been consumed

#### Parameters

##### pos

[`PositionInfo`](../interfaces/PositionInfo.md)

Position object

#### Returns

[`Token`](../interfaces/Token.md)

Metadata token

***

### parseNewlineToken()

> __parseNewlineToken__(): [`Token`](../interfaces/Token.md)

Defined in: src/parsers/dom/Tokenizer.ts:603

Parse newline token

#### Returns

[`Token`](../interfaces/Token.md)

Newline token

***

### parsePluginToken()

> __parsePluginToken__(`pos`): [`Token`](../interfaces/Token.md)

Defined in: src/parsers/dom/Tokenizer.ts:738

Parse plugin: [{PluginName param1=value1}]
Called after [{ has been consumed

#### Parameters

##### pos

[`PositionInfo`](../interfaces/PositionInfo.md)

Position object

#### Returns

[`Token`](../interfaces/Token.md)

Plugin token

***

### parseTableCellToken()

> __parseTableCellToken__(): [`Token`](../interfaces/Token.md)

Defined in: src/parsers/dom/Tokenizer.ts:845

Parse table cell: | cell

#### Returns

[`Token`](../interfaces/Token.md)

Table cell token

***

### parseTextToken()

> __parseTextToken__(): [`Token`](../interfaces/Token.md)

Defined in: src/parsers/dom/Tokenizer.ts:953

Parse plain text until next special character

#### Returns

[`Token`](../interfaces/Token.md)

Text token

***

### parseVariableToken()

> __parseVariableToken__(`pos`): [`Token`](../interfaces/Token.md)

Defined in: src/parsers/dom/Tokenizer.ts:696

Parse variable: [{$varname}]
Called after [{has been consumed

#### Parameters

##### pos

[`PositionInfo`](../interfaces/PositionInfo.md)

Position object

#### Returns

[`Token`](../interfaces/Token.md)

Variable token

***

### parseWikiTagToken()

> __parseWikiTagToken__(): [`Token`](../interfaces/Token.md)

Defined in: src/parsers/dom/Tokenizer.ts:754

Parse wiki tag or link: [link], [link|text]

#### Returns

[`Token`](../interfaces/Token.md)

Wiki tag or link token

***

### peekAhead()

> __peekAhead__(`count`): `string`

Defined in: src/parsers/dom/Tokenizer.ts:298

Peek ahead N characters without consuming them

#### Parameters

##### count

`number`

Number of characters to peek ahead

#### Returns

`string`

String of next N characters

***

### peekChar()

> __peekChar__(): `string` \| `null`

Defined in: src/parsers/dom/Tokenizer.ts:204

Get the current character without advancing

#### Returns

`string` \| `null`

Current character or null if at EOF

***

### pushBack()

> __pushBack__(`char`): `void`

Defined in: src/parsers/dom/Tokenizer.ts:259

Push a character back onto the input stream
Allows the tokenizer to "undo" reading a character

#### Parameters

##### char

`string` \| `null`

Character to push back

#### Returns

`void`

***

### readUntil()

> __readUntil__(`delimiters`, `consume?`): `string`

Defined in: src/parsers/dom/Tokenizer.ts:408

Read until a specific character or string is found

#### Parameters

##### delimiters

`string` \| `string`[]

Character(s) to stop at

##### consume?

`boolean` = `false`

Whether to consume the delimiter

#### Returns

`string`

Text read until delimiter

***

### reset()

> __reset__(): `void`

Defined in: src/parsers/dom/Tokenizer.ts:486

Reset tokenizer to beginning

#### Returns

`void`

***

### skipAllWhitespace()

> __skipAllWhitespace__(): `number`

Defined in: src/parsers/dom/Tokenizer.ts:342

Skip all whitespace including newlines

#### Returns

`number`

Number of whitespace characters skipped

***

### skipWhitespace()

> __skipWhitespace__(): `number`

Defined in: src/parsers/dom/Tokenizer.ts:324

Skip whitespace characters (space, tab)
Does NOT skip newlines

#### Returns

`number`

Number of whitespace characters skipped

***

### substring()

> __substring__(`start`, `end`): `string`

Defined in: src/parsers/dom/Tokenizer.ts:479

Get a substring of the input

#### Parameters

##### start

`number`

Start position

##### end

`number`

End position

#### Returns

`string`

Substring

***

### tokenize()

> __tokenize__(): [`Token`](../interfaces/Token.md)[]

Defined in: src/parsers/dom/Tokenizer.ts:501

Tokenize the entire input into tokens

#### Returns

[`Token`](../interfaces/Token.md)[]

Array of tokens
