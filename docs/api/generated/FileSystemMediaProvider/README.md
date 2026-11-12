[__ngdpbase API v5.43.0__](../README.md)

***

[ngdpbase API](../README.md) / FileSystemMediaProvider

# FileSystemMediaProvider

FileSystemMediaProvider - Filesystem-based implementation of BaseMediaProvider

Scans configured directories for media files, extracts EXIF/IPTC/XMP metadata
via exiftool-vendored, generates thumbnails via Sharp, and maintains a
persistent JSON index.

Dependencies:

- exiftool-vendored — EXIF/IPTC/XMP metadata extraction
- sharp — thumbnail generation (already installed)
- fs-extra — filesystem helpers

## Classes

- [default](classes/default.md)

## Interfaces

- [FileSystemMediaProviderConfig](interfaces/FileSystemMediaProviderConfig.md)

## Variables

- [DEFAULT\_MEDIA\_EXTENSIONS](variables/DEFAULT_MEDIA_EXTENSIONS.md)
