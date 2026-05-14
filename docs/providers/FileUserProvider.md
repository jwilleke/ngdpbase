---
name: FileUserProvider
description: "JSON-file user, role, and session storage — the default UserManager backend"
dateModified: '2026-05-14'
category: providers
code: src/providers/FileUserProvider.ts
---

# FileUserProvider

**Quick Reference** | [Complete Guide](FileUserProvider-Complete-Guide.md)

**Module:** `src/providers/FileUserProvider.ts`
**Type:** User Storage Provider
**Extends:** BaseUserProvider
**Status:** Production Ready

## Overview

FileUserProvider implements JSON file-based user and session storage. It's the default user storage provider, maintaining users and sessions in simple JSON files on the filesystem.

## Key Features

- **JSON file storage** - Simple, human-readable user database
- **In-memory caching** - Fast lookups via Map structures
- **Session management** - File-based session persistence
- **Automatic cleanup** - Expired sessions pruned on load
- **Configurable paths** - Flexible storage location

## Configuration

```javascript
// All configuration via ConfigurationManager (lowercase keys)
'ngdpbase.user.provider.storagedir'      // User directory (default: ./data/users)
'ngdpbase.user.provider.files.users'     // Users file (default: users.json)
'ngdpbase.user.provider.files.sessions'  // Sessions file (default: sessions.json)
```

## Basic Usage

```javascript
// FileUserProvider is configured via UserManager
// Not used directly - accessed through UserManager proxy methods

const userManager = engine.getManager('UserManager');
const provider = userManager.getCurrentUserProvider();

// Provider methods called via UserManager
await userManager.getUser('admin');           // Uses provider.getUser()
await userManager.createUser({...});          // Uses provider.createUser()
await userManager.authenticateUser('admin', 'password'); // Uses provider methods
```

## File Structure

```
data/users/
  ├── users.json      - User accounts with hashed passwords
  └── sessions.json   - Active user sessions
```

## User Data Format

```json
{
  "admin": {
    "username": "admin",
    "email": "admin@localhost",
    "password": "$2b$10$abcdef123456...",
    "fullName": "Administrator",
    "roles": ["Admin", "Authenticated"],
    "active": true,
    "created": "2025-01-15T10:00:00.000Z",
    "lastLogin": "2025-01-22T14:30:00.000Z"
  },
  "editor": {
    "username": "editor",
    "email": "editor@example.com",
    "password": "$2b$10$xyz789...",
    "fullName": "Editor User",
    "roles": ["Editor", "Authenticated"],
    "active": true,
    "created": "2025-01-16T09:00:00.000Z"
  }
}
```

## Session Data Format

```json
{
  "session-id-123": {
    "username": "admin",
    "created": "2025-01-22T14:00:00.000Z",
    "expires": "2025-01-23T14:00:00.000Z",
    "data": {
      "lastActivity": "2025-01-22T14:30:00.000Z"
    }
  }
}
```

## Core Methods

| Method | Purpose | Example |
| -------- | --------- | --------- |
| `getUser(username)` | Get user by username | `await provider.getUser('admin')` |
| `getUsers()` | Get all users | `const users = await provider.getUsers()` |
| `createUser(userData)` | Create new user | `await provider.createUser({username: 'bob', ...})` |
| `updateUser(username, updates)` | Update user data | `await provider.updateUser('admin', {email: '...'})` |
| `deleteUser(username)` | Delete user | `await provider.deleteUser('olduser')` |
| `userExists(username)` | Check if user exists | `if (await provider.userExists('admin'))` |
| `loadUsers()` | Reload users from disk | `await provider.loadUsers()` |
| `saveUsers()` | Save users to disk | `await provider.saveUsers()` |

## Session Management

```javascript
// Sessions are loaded and cleaned automatically during initialize()
await provider.loadSessions();  // Loads from sessions.json, prunes expired

// Session access (typically via express-session, not direct)
const session = provider.sessions.get('session-id-123');
```

## User CRUD Operations

### Create User

```javascript
const newUser = {
  username: 'newuser',
  email: 'new@example.com',
  password: 'hashedPassword123',  // Must be pre-hashed by UserManager
  fullName: 'New User',
  roles: ['Authenticated'],
  active: true
};

await provider.createUser(newUser);
// Adds to users Map and saves to users.json
```

### Update User

```javascript
await provider.updateUser('admin', {
  email: 'admin@newdomain.com',
  lastLogin: new Date().toISOString()
});
// Updates in-memory Map and persists to users.json
```

### Delete User

```javascript
await provider.deleteUser('olduser');
// Removes from users Map and saves to users.json
```

## Cache Management

FileUserProvider uses in-memory Maps for performance:

```javascript
{
  users: Map {
    'admin' => { username: 'admin', ... },
    'editor' => { username: 'editor', ... }
  },
  sessions: Map {
    'session-id-123' => { username: 'admin', ... }
  }
}
```

### Refresh Cache

```javascript
// Reload users from disk (useful after external modifications)
await provider.loadUsers();

// Manual cache clear
provider.users.clear();
await provider.loadUsers();
```

## Session Cleanup

Sessions are automatically cleaned on load:

```javascript
async loadSessions() {
  // Reads sessions.json
  // Filters out expired sessions (expires < now)
  // Stores only active sessions in memory
  // Saves cleaned sessions back to disk
}
```

## Error Handling

```javascript
try {
  await provider.createUser({ username: 'admin', ... });
} catch (err) {
  if (err.message.includes('already exists')) {
    // Duplicate username
  }
}

// Check before operations
if (await provider.userExists('admin')) {
  await provider.updateUser('admin', { ... });
}
```

## Performance Considerations

- **In-memory cache** - All users loaded at startup, O(1) lookups
- **File writes** - Every create/update/delete writes to disk
- **Session cleanup** - Automatic pruning on load prevents file bloat
- **No database** - Simple JSON files, no SQL overhead

## Dependencies

- `fs/promises` - Async filesystem operations
- `path` - Path manipulation
- `logger` - Application logging

## Security Notes

- **Passwords are NOT stored in provider** - UserManager handles hashing
- **Provider stores hashed passwords only** - Never plaintext
- **Sessions in filesystem** - Consider memory-based sessions for production
- **File permissions** - Ensure users.json is not world-readable

## Related Documentation

- **Complete Guide:** [FileUserProvider-Complete-Guide.md](FileUserProvider-Complete-Guide.md)
- **Parent Class:** [BaseUserProvider.md](BaseUserProvider.md)
- **Manager:** [UserManager.md](../managers/UserManager.md)
- **Security:** [Policies-Roles-Permissions.md](../architecture/Policies-Roles-Permissions.md)

---

**Last Updated:** 2025-12-22
**Version:** 1.5.0
