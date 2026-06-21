export * from './common';

export * from './users';
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
002. governorates                 - uuid        - NO          - NO        - NO
003. cities                       - uuid        - NO          - NO        - NO
004. customers                    - uuid        - SOFT        - YES       - YES (NOT NULL)
005. customer_addresses           - uuid        - NO          - NO        - NO
006. vendors                      - uuid        - SOFT        - YES       - YES (NOT NULL)
007. vendor_addresses             - uuid        - NO          - NO        - NO
008. product_category_mains       - uuid        - NO          - NO        - NO
009. product_category_subs        - uuid        - NO          - NO        - NO
010. products                     - text        - SOFT        - YES       - YES (NOT NULL)
011. material_category_mains      - uuid        - NO          - NO        - NO
012. material_category_subs       - uuid        - NO          - NO        - NO
013. materials                    - text        - SOFT        - YES       - YES (NOT NULL)
014. inquiries                    - uuid        - NO          - YES       - YES (NOT NULL)
015. inquiry_items                - uuid        - NO          - NO        - NO
016. previews                     - uuid        - NO          - YES       - YES (NOT NULL)
017. preview_items                - uuid        - NO          - NO        - NO
018. preview_item_dimensions      - uuid        - NO          - NO        - NO
019. offers                       - uuid        - NO          - YES       - YES (NOT NULL)
020. offer_items                  - uuid        - NO          - NO        - NO
021. orders                       - uuid        - NO          - YES       - YES (NOT NULL)
022. order_items                  - uuid        - NO          - NO        - NO
023. order_item_dimensions        - uuid        - NO          - NO        - NO
024. boms                         - uuid        - NO          - YES       - YES (NOT NULL)
025. purchase_orders              - uuid        - NO          - YES       - YES (NOT NULL)
026. purchase_order_items         - uuid        - NO          - NO        - NO
027. purchase_receipts            - uuid        - NO          - YES       - YES (NOT NULL)
028. purchase_receipt_items       - uuid        - NO          - NO        - NO
029. vendor_quotation_emails      - uuid        - NO          - YES       - YES (NOT NULL)
030. deliveries                   - uuid        - NO          - YES       - YES (NOT NULL)
031. delivery_items               - uuid        - NO          - NO        - NO
032. production_plans             - uuid        - NO          - YES       - YES (NOT NULL)
033. production_plan_items        - uuid        - NO          - NO        - NO
034. production_plan_item_notes   - uuid        - NO          - YES       - YES (NOT NULL)
035. inventory_transactions       - uuid        - NO          - YES       - YES (NOT NULL)
036. inventory_transaction_items  - uuid        - NO          - NO        - NO
037. roles                        - uuid        - NO          - YES       - YES (NOT NULL)
038. role_permissions             - composite   - NO          - NO        - NO

*/
