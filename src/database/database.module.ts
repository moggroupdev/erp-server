import { Pool } from 'pg';
import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from './database.constants';
import * as schema from './schema';

@Module({
  providers: [
    {
      provide: DRIZZLE,
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const logger = new Logger('DatabaseModule');
        const databaseUrl = config.get<string>('DATABASE_URL');
        const pool = new Pool({ connectionString: databaseUrl });
        try {
          await pool.query('SELECT 1'); // Test the connection
          logger.log('Database connected successfully');
        } catch (error) {
          logger.error('Failed to connect to database', error);
          throw error;
        }
        return drizzle(pool, { schema });
      },
    },
  ],
  exports: [DRIZZLE],
})
export class DatabaseModule {}
