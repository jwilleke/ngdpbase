## Installation System Testing Guide

Complete guide for testing the first-run installation wizard.

## Quick Test

```bash
# 1. Simulate first-run environment
./scripts/test-install.sh

# 2. Start server
./server.sh start dev

# 3. Navigate to http://localhost:3000
# Should automatically redirect to /install

# 4. Complete installation form

# 5. After testing, restore original files
./scripts/restore-install-test.sh .install-test-backup-[timestamp]
```

## What test-install.sh Does

Creates a clean first-run environment by:

1. Backing up existing files to `.install-test-backup-[timestamp]/`
2. Removing `data/config/app-custom-config.json`
3. Removing `users/users.json`
4. Removing `users/organizations.json`
5. Moving `pages/` directory to backup
6. Creating empty `pages/` directory

## Installation Form Fields

### Required Fields

__Basic Configuration:__

- Application Name (e.g., "Test Wiki")
- Base URL (e.g., "<http://localhost:3000>")

__Administrator Account:__

- Username (e.g., "testadmin")
- Email (e.g., "<admin@test.com>")
- Password (minimum 8 characters)
- Confirm Password (must match)

__Organization Information:__

- Organization Name (e.g., "Test Organization")
- Description (e.g., "Testing the install system")

### Optional Fields (Advanced Settings)

- Legal Name
- Founding Date (YYYY format)
- City
- State/Region
- Country
- Session Secret (auto-generated)

### Startup Pages Option

- Checkbox: "Copy startup pages to initialize wiki" (checked by default)
- Copies all pages from `required-pages/` to `pages/`

## Expected Results

### 1. Redirect to Install

When accessing any URL with install required, should redirect to `/install`

### 2. Form Display

- Clean, professional Bootstrap 5 interface
- All fields visible and accessible
- Session secret pre-generated
- Startup pages checkbox checked by default

### 3. Form Validation

__Client-side:__

- Required fields highlighted if empty
- Password length checked (min 8 chars)
- Passwords compared for match
- Alert shown for validation errors

__Server-side:__

- All required fields validated
- Email format validated
- URL format validated
- Password confirmation checked

### 4. Successful Installation

After form submission, the following should be created:

__data/config/app-custom-config.json:__

```json
{
  "ngdpbase.application-name": "Test Wiki",
  "ngdpbase.application.base-url": "http://localhost:3000",
  "ngdpbase.session.secret": "[64-char hex string]",
  "ngdpbase.install.organization.name": "Test Organization",
  "ngdpbase.install.organization.description": "Testing the install system",
  "ngdpbase.install.organization.contact-email": "admin@test.com",
  ...
}
```

__users/organizations.json:__

```json
[
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    "identifier": "ngdpbase-platform",
    "name": "Test Organization",
    "description": "Testing the install system",
    "url": "http://localhost:3000",
    "contactPoint": [
      {
        "@type": "ContactPoint",
        "email": "admin@test.com",
        ...
      }
    ],
    ...
  }
]
```

__users/users.json:__

- Admin user created with provided username
- Password hashed securely
- Roles: ["admin", "Authenticated", "All"]
- Email from form

__pages/ directory:__

- All .md files copied from required-pages/
- System pages (system-category: system)
- Documentation pages (system-category: documentation)

### 5. Success Page

- Displays installation summary
- Shows admin username (NOT password)
- Lists next steps
- Button to go to login page

### 6. Login and Access

- Navigate to /login
- Login with created admin credentials
- Should successfully authenticate
- Access admin features

### 7. No Reinstall

- After successful install, visiting / should NOT redirect to /install
- /install route should redirect to / (install already complete)

## Testing Checklist

### Pre-Installation

- [ ] Run test-install.sh successfully
- [ ] Backup files created
- [ ] Original files removed/moved
- [ ] Server starts without errors

### Form Display

- [ ] /install route accessible
- [ ] Form displays correctly
- [ ] All fields visible
- [ ] Session secret generated
- [ ] Startup pages checkbox present and checked

### Form Validation

- [ ] Required fields cannot be empty
- [ ] Email validation works
- [ ] URL validation works
- [ ] Password minimum length enforced (8 chars)
- [ ] Password confirmation validated
- [ ] Error messages display clearly

### Installation Process

- [ ] Form submits successfully
- [ ] No console errors
- [ ] data/config/app-custom-config.json created
- [ ] users/organizations.json created with Schema.org structure
- [ ] users/users.json created with admin user
- [ ] pages/ populated with startup pages from required-pages/
- [ ] .install-complete marker file created in INSTANCE_DATA_FOLDER

### Post-Installation

- [ ] Success page displays
- [ ] Installation summary accurate
- [ ] "Go to Login" button works
- [ ] Login page accessible
- [ ] Can login with created admin credentials
- [ ] Admin has proper roles and permissions
- [ ] Startup pages visible in wiki
- [ ] Navigation (leftmenu/footer) works

### Subsequent Visits

- [ ] Visiting / does NOT redirect to /install
- [ ] /install redirects to / (already completed)
- [ ] No install loop or errors

## Common Issues and Solutions

### Issue: Install Loop (keeps redirecting to /install)

__Possible causes:__

1. `.install-complete` marker file missing from INSTANCE_DATA_FOLDER
2. Admin user not created properly
3. pages/ directory empty

__Solutions:__

```bash
# Check for install marker file
ls -la data/.install-complete

# Check admin user
cat data/users/users.json | grep "admin"

# Check pages
ls pages/*.md | wc -l  # Should show number of pages from required-pages/
```

### Issue: Form Validation Errors

__Cause:__ Client-side JavaScript validation failing

__Solution:__

- Check browser console for errors
- Ensure Bootstrap JS loaded
- Verify form field names match validation script

### Issue: 500 Error on Form Submit

__Possible causes:__

1. Missing required fields
2. Write permissions on config/ or users/ directories
3. InstallService error

__Solutions:__

```bash
# Check permissions
ls -la config/
ls -la users/

# Check server logs
./server.sh logs

# Check PM2 error log
cat ~/.pm2/logs/ngdpbase-error.log
```

### Issue: Pages Not Copied

__Cause:__ Startup pages checkbox unchecked or copy failed

__Solution:__

```bash
# Manual copy if needed
cp required-pages/*.md pages/

# Verify source files exist
ls required-pages/*.md | wc -l  # Should show files
```

### Issue: Can't Login After Install

__Possible causes:__

1. Admin user not created
2. Wrong credentials
3. User not active

__Solutions:__

```bash
# Check if admin created
cat users/users.json | grep -A 10 "testadmin"

# Reset if needed by re-running install test
```

## Restoring Original Files

After testing, restore your original configuration:

```bash
# Find backup directory
ls -d .install-test-backup-*

# Restore files
./scripts/restore-install-test.sh .install-test-backup-[timestamp]

# Verify restoration
ls data/config/app-custom-config.json
ls users/users.json
ls pages/*.md | wc -l
```

## Manual Testing Without Scripts

If you prefer manual testing:

```bash
# 1. Backup files manually
mkdir .manual-backup
cp data/config/app-custom-config.json .manual-backup/ 2>/dev/null
cp users/users.json .manual-backup/ 2>/dev/null
cp users/organizations.json .manual-backup/ 2>/dev/null
cp -r pages .manual-backup/ 2>/dev/null

# 2. Remove for first-run
rm data/config/app-custom-config.json 2>/dev/null
rm users/users.json 2>/dev/null
rm users/organizations.json 2>/dev/null
rm -rf pages && mkdir pages

# 3. Test install flow

# 4. Restore
cp .manual-backup/app-custom-config.json config/
cp .manual-backup/users.json users/
cp .manual-backup/organizations.json users/
rm -rf pages && mv .manual-backup/pages pages
```

## Testing Different Scenarios

### Scenario 1: Minimal Install (No Startup Pages)

- Uncheck "Copy startup pages" checkbox
- Submit form
- Verify pages/ remains empty
- Verify other files still created

### Scenario 2: Custom Organization Data

- Fill all optional fields (address, founding date)
- Submit form
- Verify users/organizations.json has complete data

### Scenario 3: Different Admin Username

- Use non-default username (not "admin")
- Submit form
- Verify can login with custom username

### Scenario 4: Long Application Name

- Use a very long application name (50+ characters)
- Verify it displays correctly throughout system

### Scenario 5: Special Characters

- Test special characters in organization name
- Test apostrophes, quotes, etc.
- Verify proper escaping in JSON files

## Automated Testing (Future)

Consider adding automated tests:

```javascript
// Example test structure
describe('Installation System', () => {
  test('redirects to /install when not completed', async () => {
    // Setup: Remove config file
    // Visit /
    // Assert: Redirected to /install
  });

  test('creates all required files', async () => {
    // Submit install form
    // Assert: Files created
    // Assert: Proper content
  });

  test('admin can login after install', async () => {
    // Complete install
    // Login with admin
    // Assert: Authenticated
  });
});
```

## References

- InstallService: `src/services/InstallService.js`
- InstallRoutes: `src/routes/InstallRoutes.js`
- Install form: `views/install.ejs`
- Integration guide: `docs/developer/INSTALL-INTEGRATION.md`
- Issue #153: Startup pages architecture
