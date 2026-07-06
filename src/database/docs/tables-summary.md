# Database tables

Overview of all schema tables: primary key type, soft-delete / cancellation behavior, audit columns, and human-readable code support.

## Human-readable codes

Auto-generated on `INSERT` when `code` is null (see [`triggers.sql`](../sql/triggers.sql)).

**Format:** `{PREFIX}-{8-digit sequence}` — e.g. `CTR-00000042`, `USR-00000001`

- Prefix is **3 characters** (uppercase).
- Sequence is zero-padded to 8 digits per table.
- `code` is unique and immutable after creation — omit from create DTOs; never include in update DTOs.

### Adding a new coded entity

1. Add `code: text('code').unique().notNull()` with a `// Format: XXX-00000001` comment in the schema.
2. Add sequence + `BEFORE INSERT` trigger in `triggers.sql`.
3. Add the prefix to the **Code** column for that table below.

## Tables

| Table                                       | Primary key | Code | Deleting          | createdAt | createdBy      |
| ------------------------------------------- | ----------- | ---- | ----------------- | --------- | -------------- |
| users                                       | uuid        | USR  | deletedAt field   | YES       | YES (NULLABLE) |
| roles                                       | uuid        | —    | NO                | YES       | YES (NOT NULL) |
| permissions                                 | composite   | —    | NO                | NO        | NO             |
| departments                                 | uuid        | —    | NO                | NO        | NO             |
| countries                                   | uuid        | —    | NO                | NO        | NO             |
| governorates                                | uuid        | —    | NO                | NO        | NO             |
| cities                                      | uuid        | —    | NO                | NO        | NO             |
| customers                                   | uuid        | CUS  | deletedAt field   | YES       | YES (NOT NULL) |
| customer_addresses                          | uuid        | —    | NO                | NO        | NO             |
| vendors                                     | uuid        | VEN  | deletedAt field   | YES       | YES (NOT NULL) |
| vendor_addresses                            | uuid        | —    | NO                | NO        | NO             |
| material_category_mains                     | uuid        | —    | NO                | NO        | NO             |
| material_category_subs                      | uuid        | —    | NO                | NO        | NO             |
| product_category_mains                      | uuid        | —    | NO                | NO        | NO             |
| product_category_subs                       | uuid        | —    | NO                | NO        | NO             |
| products                                    | text        | —    | deletedAt field   | YES       | YES (NOT NULL) |
| product_production_routes                   | uuid        | —    | NO                | NO        | NO             |
| product_dimensions                          | uuid        | —    | NO                | YES       | YES (NOT NULL) |
| product_standard_boms                       | uuid        | —    | NO                | YES       | YES (NOT NULL) |
| materials                                   | text        | —    | deletedAt field   | YES       | YES (NOT NULL) |
| inquiries                                   | uuid        | —    | cancelled status  | YES       | YES (NOT NULL) |
| inquiry_items                               | uuid        | —    | NO                | NO        | NO             |
| previews                                    | uuid        | —    | cancelledAt field | YES       | YES (NOT NULL) |
| preview_items                               | uuid        | —    | NO                | NO        | NO             |
| offers                                      | uuid        | —    | cancelled status  | YES       | YES (NOT NULL) |
| offer_items                                 | uuid        | —    | NO                | NO        | NO             |
| offer_negotiations                          | uuid        | —    | NO                | YES       | YES (NOT NULL) |
| contracts                                   | uuid        | CTR  | cancelledAt field | YES       | YES (NOT NULL) |
| contract_items                              | uuid        | —    | NO                | NO        | NO             |
| material_purchase_orders                    | uuid        | MPO  | cancelledAt field | YES       | YES (NOT NULL) |
| material_purchase_order_items               | uuid        | —    | NO                | NO        | NO             |
| material_purchase_order_item_contract_items | uuid        | —    | NO                | NO        | NO             |
| material_purchase_receipts                  | uuid        | MPR  | NO                | YES       | YES (NOT NULL) |
| material_purchase_receipt_items             | uuid        | —    | NO                | NO        | NO             |
| vendor_quotation_emails                     | uuid        | —    | NO                | YES       | YES (NOT NULL) |
| deliveries                                  | uuid        | DEL  | cancelledAt field | YES       | YES (NOT NULL) |
| delivery_items                              | uuid        | —    | NO                | NO        | NO             |
| trips                                       | uuid        | TRP  | cancelledAt field | YES       | YES (NOT NULL) |
| installations                               | uuid        | INS  | cancelledAt field | YES       | YES (NOT NULL) |
| installation_items                          | uuid        | —    | NO                | NO        | NO             |
| customer_receptions                         | uuid        | REC  | NO                | YES       | YES (NOT NULL) |
| customer_reception_items                    | uuid        | —    | NO                | NO        | NO             |
| service_agreements                          | uuid        | SVC  | NO                | YES       | YES (NOT NULL) |
| maintenance_orders                          | uuid        | MNT  | cancelledAt field | YES       | YES (NOT NULL) |
| maintenance_order_items                     | uuid        | —    | NO                | NO        | NO             |
| maintenance_order_spare_parts               | uuid        | —    | NO                | NO        | NO             |
| production_plans                            | uuid        | PPL  | NO                | YES       | YES (NOT NULL) |
| production_sub_department_managers          | enum        | —    | NO                | NO        | NO             |
| production_plan_items                       | uuid        | —    | NO                | NO        | NO             |
| production_plan_item_notes                  | uuid        | —    | NO                | YES       | YES (NOT NULL) |
| inventory_transactions                      | uuid        | IVT  | NO                | YES       | YES (NOT NULL) |
| inventory_transaction_items                 | uuid        | —    | NO                | NO        | NO             |
| login_history                               | uuid        | —    | NO                | YES       | NO             |
| product_units                               | uuid        | —    | NO                | YES       | YES (NOT NULL) |
| product_purchase_orders                     | uuid        | PPO  | cancelledAt field | YES       | YES (NOT NULL) |
| product_purchase_order_items                | uuid        | —    | NO                | NO        | NO             |
| product_purchase_receipts                   | uuid        | PPR  | NO                | YES       | YES (NOT NULL) |
| product_purchase_receipt_items              | uuid        | —    | NO                | NO        | NO             |
