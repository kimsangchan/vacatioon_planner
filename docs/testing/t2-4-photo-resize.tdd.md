# T2-4 Photo Resize TDD Evidence

Date: 2026-08-06

## Source

Task derived from `tasks.md` T2-4: implement `src/lib/photo/resize.ts` with failing tests first for max 1600px resizing, unchanged small-image dimensions, WebP output, and 2MB upper bound behavior.

## User Journey

As a traveler, I want uploaded trip photos to be resized consistently before storage, so that large images do not exceed the app's storage and rendering limits.

## RED Evidence

Command:

```bash
npm test
```

Result:

```text
FAIL src/lib/photo/resize.test.ts
Error: Cannot find module './resize'
```

This was the intended compile-time RED state because the new tests referenced the missing `photo/resize` implementation.

## GREEN Evidence

Commands:

```bash
npm test -- resize.test.ts
npm test
npm run lint
npm run build
```

Results:

```text
npm test -- resize.test.ts: 1 passed, 4 tests passed
npm test: 4 passed, 22 tests passed
npm run lint: exit code 0
npm run build: exit code 0
```

## Test Specification

| # | Guarantee | Test file | Type | Result |
|---|---|---|---|---|
| 1 | Images larger than 1600px on the longest side are scaled down proportionally | `src/lib/photo/resize.test.ts` | Unit | PASS |
| 2 | Images already within 1600px keep their original dimensions | `src/lib/photo/resize.test.ts` | Unit | PASS |
| 3 | Output is encoded as WebP | `src/lib/photo/resize.test.ts` | Unit | PASS |
| 4 | Encoding retries at lower quality until the result is at most 2MB | `src/lib/photo/resize.test.ts` | Unit | PASS |
| 5 | Encoding failure above the 2MB limit raises `PhotoResizeError` | `src/lib/photo/resize.test.ts` | Unit | PASS |

## Coverage And Gaps

No coverage script exists in `package.json`, so coverage percentage was not generated. The implementation is unit-tested through injected browser primitives; real browser canvas behavior should be covered later when photo upload UI is added.
