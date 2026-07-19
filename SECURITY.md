# Security policy

## Supported version

Only the latest commit on `main` is supported during the 0.x preview.

## Report a vulnerability

Use GitHub's private vulnerability reporting flow under the repository Security
tab. Include the affected route or file, impact, reproduction steps, and a
minimal proof of concept. Do not include wallet keys, API credentials, personal
data, or attacks against systems you do not own.

Boundary is defense in depth. A missed prompt-injection phrase by itself is
usually a detector improvement; an SSRF bypass, payment bypass, secret leak,
remote code execution path, or reliable denial of service is a security issue.

Please allow time for triage before public disclosure.
