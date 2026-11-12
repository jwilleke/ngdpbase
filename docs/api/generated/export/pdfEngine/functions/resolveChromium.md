[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [export/pdfEngine](../README.md) / resolveChromium

# Function: resolveChromium()

> __resolveChromium__(`configuredPath`, `deps?`): `Promise`\<[`ChromiumResolution`](../type-aliases/ChromiumResolution.md)\>

Defined in: src/export/pdfEngine.ts:169

Find a Chromium to render with. Read on every call, so installing Chromium
or setting the path takes effect without a restart.

## Parameters

### configuredPath

`string`

`ngdpbase.export.pdf.provider.local-chrome.chromium-path` ('' = find one)

### deps?

[`ResolveDeps`](../interfaces/ResolveDeps.md) = `{}`

## Returns

`Promise`\<[`ChromiumResolution`](../type-aliases/ChromiumResolution.md)\>
