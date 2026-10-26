# Security Specification: School Exchange System

## Data Invariants
1. A user can only modify their own profile (except admins).
2. Only the owner of an item can update its details or delete it.
3. An item's status can only be changed to 'held' if it is currently 'available'.
4. A 'Hold' record must link to an existing 'Item'.
5. A requester can only create one active hold per item.
6. A requester cannot hold their own item.
7. Trust score can only be modified by the system (via functions or admin). *For this applet, we'll allow admins or specific logic to update it.*
8. Timestamps must be server-validated.

## The Dirty Dozen Payloads (Target: PERMISSION_DENIED)

1. **Identity Spoofing**: User A tries to update User B's profile.
   ```json
   { "path": "/users/userB", "method": "update", "data": { "displayName": "Hacker" }, "auth": { "uid": "userA" } }
   ```
2. **Role Escalation**: A normal user tries to make themselves an admin.
   ```json
   { "path": "/users/userA", "method": "update", "data": { "role": "admin" }, "auth": { "uid": "userA" } }
   ```
3. **Item Hijacking**: User A tries to delete User B's item.
   ```json
   { "path": "/items/itemB", "method": "delete", "auth": { "uid": "userA" } }
   ```
4. **Status Shortcutting**: User A tries to mark an item as 'exchanged' without a completed hold.
   ```json
   { "path": "/items/itemB", "method": "update", "data": { "status": "exchanged" }, "auth": { "uid": "userA" } }
   ```
5. **Ghost Item Creation**: Creating an item with a fake `sellerId`.
   ```json
   { "path": "/items/itemC", "method": "create", "data": { "title": "Math", "sellerId": "userB" }, "auth": { "uid": "userA" } }
   ```
6. **Price Poisoning**: Setting a negative price.
   ```json
   { "path": "/items/itemC", "method": "create", "data": { "title": "Math", "price": -100, "sellerId": "userA" }, "auth": { "uid": "userA" } }
   ```
7. **Reservation Overwrite**: User A tries to cancel User B's hold.
   ```json
   { "path": "/holds/holdB", "method": "update", "data": { "status": "cancelled" }, "auth": { "uid": "userA" } }
   ```
8. **Time Travel**: Setting `createdAt` to a past date.
   ```json
   { "path": "/items/itemC", "method": "create", "data": { "createdAt": "2000-01-01T00:00:00Z" }, "auth": { "uid": "userA" } }
   ```
9. **Large Payload Attack**: Sending a 2MB description.
   ```json
   { "path": "/items/itemC", "method": "create", "data": { "description": "A".repeat(2000000) }, "auth": { "uid": "userA" } }
   ```
10. **Orphan Hold**: Creating a hold for a non-existent item.
    ```json
    { "path": "/holds/holdD", "method": "create", "data": { "itemId": "non-existent" }, "auth": { "uid": "userA" } }
    ```
11. **Self-Reservation**: Seller trying to hold their own item.
    ```json
    { "path": "/holds/holdE", "method": "create", "data": { "itemId": "itemA", "sellerId": "userA", "requesterId": "userA" }, "auth": { "uid": "userA" } }
    ```
12. **Double Holding**: Creating two active holds for the same item. (Logic check)

## Test Runner (firestore.rules.test.ts)
*Note: This is a conceptual test runner for rule validation.*
