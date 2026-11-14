# Security Specification: UniExchange School Textbook & Equipment Exchange System

## Data Invariants (`snake_case` Standardized Schema)
1. A student can only modify their own editable profile fields (`student_id_code`, `full_name`, `phone_number`, `avatar_url`, `updated_at`), never `role` or arbitrary `current_trust_score`.
2. Only the seller (`seller_id == request.auth.uid`) or an `admin` can edit or delete an item, and deletion/editing is strictly blocked while `item_status == 'held'`.
3. An item's `item_status` can only transition `available -> held` atomically alongside a newly created active `/holds/{holdId}` verified via `getAfter()`.
4. Every `/holds/{holdId}` document must reference an existing, `approved`, `available` `/items/{itemId}` and requires `current_trust_score >= 50` and `status == 'active'`.
5. Only one active hold can exist per item (`active_hold_id == holdId` lock invariant).
6. A seller cannot place a hold on their own item (`requester_id != seller_id` and verified against `items/{item_id}.seller_id`).
7. `current_trust_score` only changes by controlled transaction deltas (`+5` / `-10` within `0..200`) or by `admin`, with an append-only immutable ledger `/users/{userId}/trust_history/{logId}` (`update, delete: if false`).
8. All write timestamps (`created_at`, `updated_at`, `timestamp`) must equal `request.time`.

## The Dirty Dozen Payloads (Target: `PERMISSION_DENIED` in `firestore.rules`)

1. **Identity Spoofing**: User A tries to update User B's profile.
   ```json
   { "path": "/users/userB", "method": "update", "data": { "full_name": "Hacker" }, "auth": { "uid": "userA" } }
   ```
2. **Role Escalation**: A normal student tries to make themselves an admin.
   ```json
   { "path": "/users/userA", "method": "update", "data": { "role": "admin" }, "auth": { "uid": "userA" } }
   ```
3. **Item Hijacking**: User A tries to delete User B's item (or Seller B tries to delete while `item_status == 'held'`).
   ```json
   { "path": "/items/itemB", "method": "delete", "auth": { "uid": "userA" } }
   ```
4. **Status Shortcutting**: User A tries to mark an item as `'completed'` directly without an active hold.
   ```json
   { "path": "/items/itemB", "method": "update", "data": { "item_status": "completed" }, "auth": { "uid": "userA" } }
   ```
5. **Ghost Item Creation**: Creating an item with a spoofed `seller_id`.
   ```json
   { "path": "/items/itemC", "method": "create", "data": { "title": "Giải tích 1", "seller_id": "userB" }, "auth": { "uid": "userA" } }
   ```
6. **Price Poisoning**: Setting a negative price (`price < 0`) or `item_type == 'gift'` with `price > 0`.
   ```json
   { "path": "/items/itemC", "method": "create", "data": { "title": "Giải tích 1", "item_type": "sell", "price": -100, "seller_id": "userA" }, "auth": { "uid": "userA" } }
   ```
7. **Reservation Overwrite**: User A tries to cancel User B's active hold.
   ```json
   { "path": "/holds/holdB", "method": "update", "data": { "hold_status": "cancelled" }, "auth": { "uid": "userA" } }
   ```
8. **Time Travel**: Setting `created_at` to a past date instead of `request.time`.
   ```json
   { "path": "/items/itemC", "method": "create", "data": { "created_at": "2000-01-01T00:00:00Z" }, "auth": { "uid": "userA" } }
   ```
9. **Large Payload Attack**: Sending a 2MB `description` exceeding `size() <= 1000`.
   ```json
   { "path": "/items/itemC", "method": "create", "data": { "description": "A...(2,000,000 chars)" }, "auth": { "uid": "userA" } }
   ```
10. **Orphan Hold**: Creating a hold referencing a non-existent `/items/{item_id}`.
    ```json
    { "path": "/holds/holdD", "method": "create", "data": { "item_id": "non-existent" }, "auth": { "uid": "userA" } }
    ```
11. **Self-Reservation**: Seller trying to hold their own item.
    ```json
    { "path": "/holds/holdE", "method": "create", "data": { "item_id": "itemA", "seller_id": "userA", "requester_id": "userA" }, "auth": { "uid": "userA" } }
    ```
12. **Double Holding**: Creating two concurrent `active` holds on the same `item_id` (blocked by `runTransaction` + `get()`/`getAfter()` `active_hold_id` lock check).
