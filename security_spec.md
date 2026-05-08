# Security Spec for THERMOSCAN AI

## Data Invariants
1. An activity log must have a valid `userId`.
2. Access to activities is strictly restricted to the owner (`userId` matches the requester).
3. Activities are immutable (no updates or deletes allowed).
4. User profiles can only be managed by the owner.

## The "Dirty Dozen" Payloads (All should be DENIED)

1. **Identity Spoofing**: An authenticated user `user_A` tries to read activities of `user_B`.
2. **Resource Poisoning**: Creating an activity with a 2MB metadata object. 
3. **State Shortcutting**: Updating an activity type to something not in the enum.
4. **Unauthenticated Read**: Reading `/activities` collection without signing in.
5. **Ghost Field Injection**: Creating a user profile with an extra `isAdmin: true` field.
6. **Path Variable Poisoning**: Accessing `/activities/very-long-id-intended-to-crash-or-exploit`.
7. **Bypassing Relation**: Creating an activity for a `userId` that doesn't exist or isn't the caller's.
8. **PII Leak**: An authenticated user downloading another's profile using `users.list()`.
9. **Denial of Wallet**: A loop creating 1000 tiny activities to exhaust Firestore writes (rules should enforce size/rate if possible, primarily via type/key checks).
10. **Timestamp Fraud**: Providing a future `createdAt` timestamp instead of `request.time`.
11. **Malicious ID**: Creating a document with ID `./../malicious`.
12. **Update Gap Exploitation**: Changing the `userId` of an existing activity.

## Test Runner (firestore.rules.test.ts)
I will provide the rules and then verify them.
