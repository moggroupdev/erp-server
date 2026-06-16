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
export * from './boms';
export * from './purchasing';
export * from './deliveries';

/*

All Tables

## table                         - primaryKey  - deleting    - createdAt - createdBy

001. users                        - uuid        - deletedAt   - YES       - YES (nullable)
002. governorates                 - uuid        - NO          - NO        - NO
003. cities                       - uuid        - NO          - NO        - NO
004. customers                    - uuid        - deletedAt   - YES       - YES (NOT NULL)
005. customer_addresses           - uuid        - NO          - NO        - NO
006. vendors                      - uuid        - deletedAt   - YES       - YES (NOT NULL)
007. vendor_addresses             - uuid        - NO          - NO        - NO
008. products                     - code        - deletedAt   - YES       - YES (NOT NULL)
009. materials                    - code        - deletedAt   - YES       - YES (NOT NULL)
010. inquiries                    - uuid        - NO          - YES       - YES (NOT NULL)
011. inquiry_items                - uuid        - NO          - NO        - NO
012. previews                     - uuid        - NO          - YES       - YES (NOT NULL)
013. preview_items                - uuid        - NO          - NO        - NO
014. offers                       - uuid        - NO          - YES       - YES (NOT NULL)
015. offer_items                  - uuid        - NO          - NO        - NO
016. orders                       - uuid        - NO          - YES       - YES (NOT NULL)
017. order_items                  - uuid        - NO          - NO        - NO
018. boms                         - uuid        - NO          - YES       - YES (NOT NULL)
019. purchase_orders              - uuid        - NO          - YES       - YES (NOT NULL)
020. purchase_order_items         - uuid        - NO          - NO        - NO
021. deliveries                   - uuid        - NO          - YES       - YES (NOT NULL)
022. delivery_items               - uuid        - NO          - NO        - NO

*/
