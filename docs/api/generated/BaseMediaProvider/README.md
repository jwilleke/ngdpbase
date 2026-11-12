[__ngdpbase API v5.43.0__](../README.md)

***

[ngdpbase API](../README.md) / BaseMediaProvider

# BaseMediaProvider

BaseMediaProvider - Abstract base class for media providers

Defines the interface that all media providers must implement.
MediaManager uses this interface to interact with the underlying
media storage / scanning implementation.

Implements AssetProvider (Epic #405 Phase 1) so the AssetManager can
consume any media backend through a single interface.

## Classes

- [default](classes/default.md)

## Interfaces

- [MediaItem](interfaces/MediaItem.md)
- [ScanResult](interfaces/ScanResult.md)
