# Security Policy

## Supported Versions

We release patches for security vulnerabilities. Which versions are eligible for receiving such patches depends on the CVSS v3.0 Rating:

| Version | Supported          |
| ------- | ------------------ |
| 1.3.x   | :white_check_mark: |
| < 1.3   | :x:                |

## Reporting a Vulnerability

__Please do not report security vulnerabilities through public GitHub issues.__

If you discover a security vulnerability in ngdpbase, please report it to us privately. This allows us to assess and fix the issue before it becomes public knowledge.

### How to Report

1. __Email__: Send details to the repository maintainer via GitHub
2. __Include__:
   - Type of vulnerability
   - Full paths of source file(s) related to the vulnerability
   - Location of the affected source code (tag/branch/commit or direct URL)
   - Step-by-step instructions to reproduce the issue
   - Proof-of-concept or exploit code (if possible)
   - Impact of the issue, including how an attacker might exploit it

### What to Expect

- __Acknowledgment__: Within 48 hours of your report
- __Initial Assessment__: Within 5 business days
- __Regular Updates__: At least every 7 days until resolution
- __Disclosure__: We will work with you to coordinate disclosure timing

## Security Update Policy

- Security patches will be released as soon as possible after verification
- Critical vulnerabilities will be addressed with emergency releases
- Updates will be documented in [CHANGELOG.md](CHANGELOG.md)
- GitHub Security Advisories will be published for all security releases

## Vulnerability Disclosure Policy

- We follow responsible disclosure practices
- Security issues will be disclosed publicly after a fix is available
- Credit will be given to researchers who report vulnerabilities (if desired)

## Security Best Practices for Users

When running ngdpbase:

1. __Keep Updated__: Always run the latest stable version
2. __Dependencies__: Regularly update npm dependencies (`npm audit`)
3. __Authentication__: Use strong passwords and enable session security
4. __HTTPS__: Run behind a reverse proxy with TLS/SSL in production
5. __File Permissions__: Restrict write access to `pages/` and `logs/` directories
6. __Backups__: Maintain regular backups of wiki content
7. __Environment Variables__: Never commit secrets to version control
8. __PM2 Logs__: Regularly rotate and secure log files

## Known Security Considerations

- This application stores user sessions and passwords
- File uploads (if enabled) should be carefully validated
- Cross-Site Request Forgery (CSRF) protection is enabled
- Input sanitization is applied to prevent XSS attacks
- Always run behind a reverse proxy (nginx, Apache) in production

## Dependencies

We use automated tools to monitor dependencies:

- Dependabot alerts for known vulnerabilities
- `npm audit` for security scanning
- Regular dependency updates following semantic versioning

## Questions?

For general security questions or concerns, please open a discussion on GitHub or contact the maintainers directly.
