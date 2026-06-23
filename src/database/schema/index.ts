export * from './common';

export * from './users';
export * from './countries';
export * from './governorates';
export * from './cities';
export * from './customers';
export * from './vendors';
export * from './categories';
export * from './products';
export * from './materials';
export * from './inquiries';
export * from './previews';
export * from './offers';
export * from './orders';
export * from './boms';
export * from './production-plans';
export * from './inventory-transactions';
export * from './vendor-quotation-emails';
export * from './purchasing';
export * from './deliveries';
export * from './installations';
export * from './login-history';
export * from './material-transfers';
export * from './product-transfers';

/*

All Tables

###  table                        - primaryKey  - deleting            - createdAt - createdBy

001. users                        - uuid        - deletedAt field     - YES       - YES (nullable)
002. roles                        - uuid        - NO                  - YES       - YES (NOT NULL)
003. role_permissions             - composite   - NO                  - NO        - NO
004. countries                    - uuid        - NO                  - NO        - NO
005. governorates                 - uuid        - NO                  - NO        - NO
006. cities                       - uuid        - NO                  - NO        - NO
007. customers                    - uuid        - deletedAt field     - YES       - YES (NOT NULL)
008. customer_addresses           - uuid        - NO                  - NO        - NO
009. vendors                      - uuid        - deletedAt field     - YES       - YES (NOT NULL)
010. vendor_addresses             - uuid        - NO                  - NO        - NO
011. material_category_mains      - uuid        - NO                  - NO        - NO
012. material_category_subs       - uuid        - NO                  - NO        - NO
013. product_category_mains       - uuid        - NO                  - NO        - NO
014. product_category_subs        - uuid        - NO                  - NO        - NO
015. products                     - text        - deletedAt field     - YES       - YES (NOT NULL)
016. product_boms                 - uuid        - NO                  - YES       - YES (NOT NULL)
017. materials                    - text        - deletedAt field     - YES       - YES (NOT NULL)
018. inquiries                    - uuid        - cancelled status    - YES       - YES (NOT NULL)
019. inquiry_items                - uuid        - NO                  - NO        - NO
020. previews                     - uuid        - cancelledAt field   - YES       - YES (NOT NULL)
021. preview_items                - uuid        - NO                  - NO        - NO
022. preview_item_dimensions      - uuid        - NO                  - NO        - NO
023. offers                       - uuid        - cancelled status    - YES       - YES (NOT NULL)
024. offer_items                  - uuid        - NO                  - NO        - NO
025. orders                       - uuid        - cancelledAt field   - YES       - YES (NOT NULL)
026. order_items                  - uuid        - NO                  - NO        - NO
027. order_item_dimensions        - uuid        - NO                  - NO        - NO
028. boms                         - uuid        - NO                  - YES       - YES (NOT NULL)
029. purchase_orders              - uuid        - cancelledAt field   - YES       - YES (NOT NULL)
030. purchase_order_items         - uuid        - NO                  - NO        - NO
031. purchase_receipts            - uuid        - cancelledAt field   - YES       - YES (NOT NULL)
032. purchase_receipt_items       - uuid        - NO                  - NO        - NO
033. vendor_quotation_emails      - uuid        - cancelled status    - YES       - YES (NOT NULL)
034. deliveries                   - uuid        - cancelledAt field   - YES       - YES (NOT NULL)
035. delivery_items               - uuid        - NO                  - NO        - NO
036. installations                - uuid        - cancelledAt field   - YES       - YES (NOT NULL)
037. installation_items           - uuid        - NO                  - NO        - NO
038. production_plans             - uuid        - NO                  - YES       - YES (NOT NULL)
039. production_plan_items        - uuid        - NO                  - NO        - NO
040. production_plan_item_notes   - uuid        - NO                  - YES       - YES (NOT NULL)
041. inventory_transactions       - uuid        - NO                  - YES       - YES (NOT NULL)
042. inventory_transaction_items  - uuid        - NO                  - NO        - NO
043. login_history                - uuid        - NO                  - YES       - NO
044. material_transfers           - uuid        - NO                  - YES       - YES (NOT NULL)
045. material_transfer_items      - uuid        - NO                  - NO        - NO
046. product_transfers            - uuid        - NO                  - YES       - YES (NOT NULL)
047. product_transfer_items       - uuid        - NO                  - NO        - NO

*/
