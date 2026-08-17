[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/utils/VersionCompression](../README.md) / default

# Class: default

Defined in: [src/utils/VersionCompression.ts:73](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/utils/VersionCompression.ts#L73)

VersionCompression - Utility for compressing and decompressing version content

Uses pako (pure JavaScript gzip implementation) to compress old version files.
This significantly reduces disk space usage for version history.

Compression is particularly effective for:

- Text content (60-80% size reduction typical)
- Diff files (often compress very well)
- Large content files

## Example

```ts
const compressed = VersionCompression.compress("Hello world");
const decompressed = VersionCompression.decompress(compressed);
// decompressed === "Hello world"
```

## Constructors

### Constructor

> __new default__(): `VersionCompression`

#### Returns

`VersionCompression`

## Methods

### calculateRatio()

> `static` __calculateRatio__(`originalSize`, `compressedSize`): `number`

Defined in: [src/utils/VersionCompression.ts:295](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/utils/VersionCompression.ts#L295)

Calculate compression ratio

Compares original and compressed sizes to calculate space savings.

#### Parameters

##### originalSize

`number`

Original size in bytes

##### compressedSize

`number`

Compressed size in bytes

#### Returns

`number`

Compression ratio as percentage (e.g., 65.5 means 65.5% smaller)

***

### compress()

> `static` __compress__(`content`, `options`): `Buffer`

Defined in: [src/utils/VersionCompression.ts:88](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/utils/VersionCompression.ts#L88)

Compress content using gzip

Takes string or Buffer content and returns a gzip-compressed Buffer.
Uses default compression level (6) which balances speed and compression ratio.

#### Parameters

##### content

Content to compress

`string` | `Buffer`\<`ArrayBufferLike`\>

##### options

[`CompressionOptions`](../interfaces/CompressionOptions.md) = `{}`

Compression options

#### Returns

`Buffer`

Compressed content

#### Throws

If content is not string or Buffer

#### Example

```ts
const compressed = VersionCompression.compress("Large text content...");
console.log('Compression ratio:', compressed.length / original.length);
```

***

### compressFile()

> `static` __compressFile__(`filePath`, `options`): `Promise`\<[`CompressionResult`](../interfaces/CompressionResult.md)\>

Defined in: [src/utils/VersionCompression.ts:160](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/utils/VersionCompression.ts#L160)

Compress a file in place

Reads a file, compresses it, and writes it back with .gz extension.
Original file is removed after successful compression.
Creates a backup before compression for safety.

#### Parameters

##### filePath

`string`

Path to file to compress

##### options

[`FileCompressionOptions`](../interfaces/FileCompressionOptions.md) = `{}`

Compression options

#### Returns

`Promise`\<[`CompressionResult`](../interfaces/CompressionResult.md)\>

Compression statistics

#### Throws

If file doesn't exist or compression fails

#### Example

```ts
const result = await VersionCompression.compressFile('./v1/content.md');
console.log(`Saved ${result.ratio}% space`);
// File is now ./v1/content.md.gz
```

***

### decompress()

> `static` __decompress__(`compressed`): `string`

Defined in: [src/utils/VersionCompression.ts:127](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/utils/VersionCompression.ts#L127)

Decompress gzip content

Takes a gzip-compressed Buffer and returns the original string content.
Automatically handles UTF-8 encoding.

#### Parameters

##### compressed

`Buffer`

Compressed content

#### Returns

`string`

Decompressed content as string

#### Throws

If compressed is not a Buffer

#### Throws

If decompression fails (corrupted data)

#### Example

```ts
const compressed = VersionCompression.compress("Original");
const original = VersionCompression.decompress(compressed);
```

***

### decompressFile()

> `static` __decompressFile__(`filePath`, `options`): `Promise`\<[`DecompressionResult`](../interfaces/DecompressionResult.md)\>

Defined in: [src/utils/VersionCompression.ts:214](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/utils/VersionCompression.ts#L214)

Decompress a file in place

Reads a .gz file, decompresses it, and writes the original content back.
Removes the .gz file after successful decompression.

#### Parameters

##### filePath

`string`

Path to .gz file to decompress

##### options

[`FileDecompressionOptions`](../interfaces/FileDecompressionOptions.md) = `{}`

Decompression options

#### Returns

`Promise`\<[`DecompressionResult`](../interfaces/DecompressionResult.md)\>

Decompression statistics

#### Throws

If file doesn't exist, isn't .gz, or decompression fails

#### Example

```ts
await VersionCompression.decompressFile('./v1/content.md.gz');
// File is now ./v1/content.md
```

***

### getCompressedStats()

> `static` __getCompressedStats__(`filePath`): `Promise`\<[`CompressedStats`](../interfaces/CompressedStats.md)\>

Defined in: [src/utils/VersionCompression.ts:315](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/utils/VersionCompression.ts#L315)

Get compressed file stats

Returns information about a compressed file including sizes and ratio.

#### Parameters

##### filePath

`string`

Path to compressed file

#### Returns

`Promise`\<[`CompressedStats`](../interfaces/CompressedStats.md)\>

File stats

***

### isCompressed()

> `static` __isCompressed__(`filePath`): `Promise`\<`boolean`\>

Defined in: [src/utils/VersionCompression.ts:263](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/utils/VersionCompression.ts#L263)

Check if file is compressed

Checks if a file has .gz extension and is a valid gzip file.

#### Parameters

##### filePath

`string`

Path to file to check

#### Returns

`Promise`\<`boolean`\>

True if file is compressed
