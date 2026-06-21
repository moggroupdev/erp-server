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
export * from './production-plans';
export * from './boms';
export * from './purchasing';
export * from './vendor-quotation-emails';
export * from './deliveries';
export * from './inventory-transactions';

/*

All Tables

## table                         - primaryKey  - deleting    - createdAt - createdBy

001. users                        - uuid        - SOFT        - YES       - YES (nullable)
002. countries                     - uuid        - NO          - NO        - NO
003. governorates                 - uuid        - NO          - NO        - NO
004. cities                       - uuid        - NO          - NO        - NO
005. customers                    - uuid        - SOFT        - YES       - YES (NOT NULL)
006. customer_addresses           - uuid        - NO          - NO        - NO
007. vendors                      - uuid        - SOFT        - YES       - YES (NOT NULL)
008. vendor_addresses             - uuid        - NO          - NO        - NO
009. product_category_mains       - uuid        - NO          - NO        - NO
010. product_category_subs        - uuid        - NO          - NO        - NO
011. products                     - text        - SOFT        - YES       - YES (NOT NULL)
012. material_category_mains      - uuid        - NO          - NO        - NO
013. material_category_subs       - uuid        - NO          - NO        - NO
014. materials                    - text        - SOFT        - YES       - YES (NOT NULL)
015. inquiries                    - uuid        - NO          - YES       - YES (NOT NULL)
016. inquiry_items                - uuid        - NO          - NO        - NO
017. previews                     - uuid        - NO          - YES       - YES (NOT NULL)
018. preview_items                - uuid        - NO          - NO        - NO
019. preview_item_dimensions      - uuid        - NO          - NO        - NO
020. offers                       - uuid        - NO          - YES       - YES (NOT NULL)
021. offer_items                  - uuid        - NO          - NO        - NO
022. orders                       - uuid        - NO          - YES       - YES (NOT NULL)
023. order_items                  - uuid        - NO          - NO        - NO
024. order_item_dimensions        - uuid        - NO          - NO        - NO
025. boms                         - uuid        - NO          - YES       - YES (NOT NULL)
026. purchase_orders              - uuid        - NO          - YES       - YES (NOT NULL)
027. purchase_order_items         - uuid        - NO          - NO        - NO
028. purchase_receipts            - uuid        - NO          - YES       - YES (NOT NULL)
029. purchase_receipt_items       - uuid        - NO          - NO        - NO
030. vendor_quotation_emails      - uuid        - NO          - YES       - YES (NOT NULL)
031. deliveries                   - uuid        - NO          - YES       - YES (NOT NULL)
032. delivery_items               - uuid        - NO          - NO        - NO
033. production_plans             - uuid        - NO          - YES       - YES (NOT NULL)
034. production_plan_items        - uuid        - NO          - NO        - NO
035. production_plan_item_notes   - uuid        - NO          - YES       - YES (NOT NULL)
036. inventory_transactions       - uuid        - NO          - YES       - YES (NOT NULL)
037. inventory_transaction_items  - uuid        - NO          - NO        - NO
038. roles                        - uuid        - NO          - YES       - YES (NOT NULL)
039. role_permissions             - composite   - NO          - NO        - NO

*/
