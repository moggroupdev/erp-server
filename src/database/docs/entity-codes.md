# Entity codes

Human-readable identifiers for key business records. Auto-generated on `INSERT` when `code` is null (see [`triggers.sql`](../sql/triggers.sql)).

**Format:** `{PREFIX}-{7-digit sequence}` — e.g. `CTR-0000042`, `USR-0000001`

- Prefix is **3 characters** (uppercase).
- Sequence is zero-padded to 7 digits per table.
- `code` is unique and immutable after creation — omit from create DTOs; never include in update DTOs.

---

## Prefixes

| Prefix | Table                        | Example       |
| ------ | ---------------------------- | ------------- |
| `USR`  | `users`                      | `USR-0000001` |
| `CUS`  | `customers`                  | `CUS-0000001` |
| `VEN`  | `vendors`                    | `VEN-0000001` |
| `CTR`  | `contracts`                  | `CTR-0000001` |
| `MPO`  | `material_purchase_orders`   | `MPO-0000001` |
| `MPR`  | `material_purchase_receipts` | `MPR-0000001` |
| `PPO`  | `product_purchase_orders`    | `PPO-0000001` |
| `PPR`  | `product_purchase_receipts`  | `PPR-0000001` |
| `DEL`  | `deliveries`                 | `DEL-0000001` |
| `INS`  | `installations`              | `INS-0000001` |
| `PPL`  | `production_plans`           | `PPL-0000001` |
| `IVT`  | `inventory_transactions`     | `IVT-0000001` |
| `MTR`  | `material_transfers`         | `MTR-0000001` |

---

## Adding a new coded entity

1. Add `code: text('code').unique().notNull()` with a `// Format: XXX-0000001` comment in the schema.
2. Add sequence + `BEFORE INSERT` trigger in `triggers.sql`.
3. Add a row to the table above.
