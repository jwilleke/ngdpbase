[__ngdpbase API v5.43.0__](../README.md)

***

[ngdpbase API](../README.md) / types

# types

ngdpbase Type Definitions

Central export point for all TypeScript type definitions used throughout
the ngdpbase application. Import types from this module to ensure consistency.

## Example

```ts
import { WikiPage, PageFrontmatter, User } from '../types/index.js';
```

## References

### ApplicationOrganizationConfig

Re-exports [ApplicationOrganizationConfig](Config/interfaces/ApplicationOrganizationConfig.md)

***

### assertPageFrontmatter

Re-exports [assertPageFrontmatter](guards/functions/assertPageFrontmatter.md)

***

### assertUser

Re-exports [assertUser](guards/functions/assertUser.md)

***

### assertVersionMetadata

Re-exports [assertVersionMetadata](guards/functions/assertVersionMetadata.md)

***

### assertWikiPage

Re-exports [assertWikiPage](guards/functions/assertWikiPage.md)

***

### AssetCamera

Re-exports [AssetCamera](Asset/interfaces/AssetCamera.md)

***

### AssetDimensions

Re-exports [AssetDimensions](Asset/interfaces/AssetDimensions.md)

***

### AssetGPS

Re-exports [AssetGPS](Asset/interfaces/AssetGPS.md)

***

### AssetInput

Re-exports [AssetInput](Asset/interfaces/AssetInput.md)

***

### AssetMetadata

Re-exports [AssetMetadata](Asset/interfaces/AssetMetadata.md)

***

### AssetPage

Re-exports [AssetPage](Asset/interfaces/AssetPage.md)

***

### AssetProvider

Re-exports [AssetProvider](Asset/interfaces/AssetProvider.md)

***

### AssetQuery

Re-exports [AssetQuery](Asset/interfaces/AssetQuery.md)

***

### AssetRecord

Re-exports [AssetRecord](Asset/interfaces/AssetRecord.md)

***

### AssetUsageRights

Re-exports [AssetUsageRights](Asset/interfaces/AssetUsageRights.md)

***

### AssetUsageStats

Re-exports [AssetUsageStats](Asset/interfaces/AssetUsageStats.md)

***

### AttachmentMetadata

Re-exports [AttachmentMetadata](Provider/interfaces/AttachmentMetadata.md)

***

### AttachmentProvider

Re-exports [AttachmentProvider](Provider/interfaces/AttachmentProvider.md)

***

### AuditEvent

Re-exports [AuditEvent](Provider/interfaces/AuditEvent.md)

***

### AuditProvider

Re-exports [AuditProvider](Provider/interfaces/AuditProvider.md)

***

### AuthResult

Re-exports [AuthResult](User/interfaces/AuthResult.md)

***

### BaseProvider

Re-exports [BaseProvider](Provider/interfaces/BaseProvider.md)

***

### CacheProvider

Re-exports [CacheProvider](Provider/interfaces/CacheProvider.md)

***

### ConfigChangeEvent

Re-exports [ConfigChangeEvent](Config/interfaces/ConfigChangeEvent.md)

***

### ConfigPropertyDescriptor

Re-exports [ConfigPropertyDescriptor](Config/interfaces/ConfigPropertyDescriptor.md)

***

### ConfigValidationResult

Re-exports [ConfigValidationResult](Config/interfaces/ConfigValidationResult.md)

***

### isAttachmentMetadata

Re-exports [isAttachmentMetadata](guards/functions/isAttachmentMetadata.md)

***

### isAuditEvent

Re-exports [isAuditEvent](guards/functions/isAuditEvent.md)

***

### isEmail

Re-exports [isEmail](guards/functions/isEmail.md)

***

### isIsoTimestamp

Re-exports [isIsoTimestamp](guards/functions/isIsoTimestamp.md)

***

### isPageFrontmatter

Re-exports [isPageFrontmatter](guards/functions/isPageFrontmatter.md)

***

### isPageInfo

Re-exports [isPageInfo](guards/functions/isPageInfo.md)

***

### isUser

Re-exports [isUser](guards/functions/isUser.md)

***

### isUserSession

Re-exports [isUserSession](guards/functions/isUserSession.md)

***

### isUuid

Re-exports [isUuid](guards/functions/isUuid.md)

***

### isVersionManifest

Re-exports [isVersionManifest](guards/functions/isVersionManifest.md)

***

### isVersionMetadata

Re-exports [isVersionMetadata](guards/functions/isVersionMetadata.md)

***

### isWikiPage

Re-exports [isWikiPage](guards/functions/isWikiPage.md)

***

### ManagerRegistry

Re-exports [ManagerRegistry](WikiEngine/interfaces/ManagerRegistry.md)

***

### PageFrontmatter

Re-exports [PageFrontmatter](Page/interfaces/PageFrontmatter.md)

***

### PageInfo

Re-exports [PageInfo](Page/interfaces/PageInfo.md)

***

### PageListOptions

Re-exports [PageListOptions](Page/interfaces/PageListOptions.md)

***

### PageProvider

Re-exports [PageProvider](Provider/interfaces/PageProvider.md)

***

### PageSaveOptions

Re-exports [PageSaveOptions](Page/interfaces/PageSaveOptions.md)

***

### PageSearchResult

Re-exports [PageSearchResult](Page/interfaces/PageSearchResult.md)

***

### Permission

Re-exports [Permission](User/interfaces/Permission.md)

***

### ProviderCapability

Re-exports [ProviderCapability](Asset/type-aliases/ProviderCapability.md)

***

### Role

Re-exports [Role](User/interfaces/Role.md)

***

### SearchProvider

Re-exports [SearchProvider](Provider/interfaces/SearchProvider.md)

***

### SearchProviderConfig

Re-exports [SearchProviderConfig](Config/interfaces/SearchProviderConfig.md)

***

### User

Re-exports [User](User/interfaces/User.md)

***

### UserCreateData

Re-exports [UserCreateData](User/interfaces/UserCreateData.md)

***

### UserPreferences

Re-exports [UserPreferences](User/interfaces/UserPreferences.md)

***

### UserProfile

Re-exports [UserProfile](User/interfaces/UserProfile.md)

***

### UserProvider

Re-exports [UserProvider](Provider/interfaces/UserProvider.md)

***

### UserSession

Re-exports [UserSession](User/interfaces/UserSession.md)

***

### UserUpdateData

Re-exports [UserUpdateData](User/interfaces/UserUpdateData.md)

***

### VersionCleanupResult

Re-exports [VersionCleanupResult](Version/interfaces/VersionCleanupResult.md)

***

### VersionContent

Re-exports [VersionContent](Version/interfaces/VersionContent.md)

***

### VersionDiff

Re-exports [VersionDiff](Version/interfaces/VersionDiff.md)

***

### VersionHistoryEntry

Re-exports [VersionHistoryEntry](Version/interfaces/VersionHistoryEntry.md)

***

### VersioningConfig

Re-exports [VersioningConfig](Config/interfaces/VersioningConfig.md)

***

### VersioningPageProvider

Re-exports [VersioningPageProvider](Provider/interfaces/VersioningPageProvider.md)

***

### VersionManifest

Re-exports [VersionManifest](Version/interfaces/VersionManifest.md)

***

### VersionMetadata

Re-exports [VersionMetadata](Version/interfaces/VersionMetadata.md)

***

### VersionRetentionPolicy

Re-exports [VersionRetentionPolicy](Version/interfaces/VersionRetentionPolicy.md)

***

### VersionStorageInfo

Re-exports [VersionStorageInfo](Version/interfaces/VersionStorageInfo.md)

***

### WikiConfig

Re-exports [WikiConfig](Config/interfaces/WikiConfig.md)

***

### WikiEngine

Re-exports [WikiEngine](WikiEngine/interfaces/WikiEngine.md)

***

### WikiPage

Re-exports [WikiPage](Page/interfaces/WikiPage.md)
