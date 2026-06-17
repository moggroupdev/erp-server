export * from './common';

export * from './users';
export * from './governorates';
export * from './cities';

export * from './customers';
export * from './vendors';
export * from './products';
export * from './materials';
export * from './inquiries';
export * from './previews';
export * from './offers';
export * from './orders';
export * from './production-plans';
export * from './boms';
export * from './purchasing';
export * from './deliveries';

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
008. products                     - text        - SOFT        - YES       - YES (NOT NULL)
009. product_standard_dimensions  - uuid        - NO          - NO        - NO
010. materials                    - text        - SOFT        - YES       - YES (NOT NULL)
011. inquiries                    - uuid        - NO          - YES       - YES (NOT NULL)
012. inquiry_items                - uuid        - NO          - NO        - NO
013. previews                     - uuid        - NO          - YES       - YES (NOT NULL)
014. preview_items                - uuid        - NO          - NO        - NO
015. offers                       - uuid        - NO          - YES       - YES (NOT NULL)
016. offer_items                  - uuid        - NO          - NO        - NO
017. orders                       - uuid        - NO          - YES       - YES (NOT NULL)
018. order_items                  - uuid        - NO          - NO        - NO
019. boms                         - uuid        - NO          - YES       - YES (NOT NULL)
020. purchase_orders              - uuid        - NO          - YES       - YES (NOT NULL)
021. purchase_order_items         - uuid        - NO          - NO        - NO
022. deliveries                   - uuid        - NO          - YES       - YES (NOT NULL)
023. delivery_items               - uuid        - NO          - NO        - NO
024. production_plans             - uuid        - NO          - YES       - YES (NOT NULL)
025. production_plan_items        - uuid        - NO          - NO        - NO
026. production_plan_item_notes   - uuid        - NO          - YES       - YES (NOT NULL)

*/
