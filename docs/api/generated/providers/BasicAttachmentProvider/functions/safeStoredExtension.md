[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/BasicAttachmentProvider](../README.md) / safeStoredExtension

# Function: safeStoredExtension()

> __safeStoredExtension__(`originalName`, `mimeType?`): `string`

Defined in: src/providers/BasicAttachmentProvider.ts:196

The extension to store a file under, given what the uploader called it and
what they said it was.

A stored file is named `{generated-id}{ext}`. The id is ours; the extension
used to be whatever `path.extname()` returned for the uploaded name — and
that function does not promise an extension, it promises everything after
the last dot in the basename. For `photo.jpg` that is `.jpg`. For a name
written by hand in the request, such as `x.\..\..\etc\passwd`, it is
`.\etc\passwd`, and we pasted it onto the id without ever asking whether it
looked like an extension. Harmless on Linux, where `` is an ordinary
character — but it is untrusted text in a filename we construct, which it
should never have been.

So an extension is now defined rather than inherited: a short run of letters
and digits, and nothing else. It comes from

  1. the uploaded name, when that already matches the definition — which is
     every real file, and keeps `.docx`, `.heic` and the rest that no table
     here lists; or
  2. the declared MIME type through the table above, a closed set we own; or
  3. nowhere, and the file is stored as the bare id, exactly as an
     extensionless upload has always been.

Nothing downstream depends on this: a download's Content-Type comes from the
recorded `encodingFormat`, and the only reader of the stored extension is the
orphan-recovery scan, which maps it back through this same table.

## Parameters

### originalName

`string`

### mimeType?

`string`

## Returns

`string`
