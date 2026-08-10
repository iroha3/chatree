# Security Policy

## Supported Versions

Security fixes target the latest code on the default branch and the latest tagged release, when one exists. Older snapshots may not receive backports.

## Reporting a Vulnerability

Email `davidyang042@gmail.com` with the subject `TreeAI security report`.

Include:

- the affected version or commit;
- a clear description of the issue and impact;
- minimal reproduction steps or a proof of concept;
- relevant browser, provider, and operating-system details;
- suggested remediation, if known.

Do not include live API keys, private conversations, unrelated personal data, or destructive payloads. Do not open a public issue until the report has been reviewed and a coordinated disclosure plan has been agreed.

## Security Model

TreeAI is a client-only browser application:

- model API keys are stored unencrypted in IndexedDB;
- requests are sent directly from the browser to the configured provider;
- TreeAI does not provide a relay server, account system, or cloud backup;
- browser extensions, injected scripts, shared profiles, and compromised origins may access local data.

Use restricted credentials, prefer a trusted local proxy when possible, and do not configure TreeAI on shared or untrusted devices.

Useful reports include credential exposure, cross-site scripting, unsafe export handling, storage-boundary bypasses, dependency vulnerabilities with a demonstrated path, and provider-request behavior that leaks secrets.
