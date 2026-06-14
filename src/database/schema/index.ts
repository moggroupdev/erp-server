export * from './common';

export * from './governorates';
export * from './cities';

/*

All Tables

## table                    - primaryKey  - deleting    - createdAt - createdBy
  
001. users                   - uuid        - SOFT        - YES       - YES (NOT NULL)
002. governorates            - uuid        - NO          - NO        - NO
003. cities                  - uuid        - NO          - NO        - NO

*/
