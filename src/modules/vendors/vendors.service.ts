import { eq, sql } from 'drizzle-orm';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import { vendors } from 'src/database/schema';
import { Vendor, QueryParams, User } from 'src/utils/types';
import { QueryBuilderService } from 'src/utils/services/query-builder.service';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';

const POPULATION = { createdBy: { columns: { id: true, name: true } } };

@Injectable()
export class VendorsService {
  constructor(
    @Inject(DRIZZLE) private db: DrizzleDB,
    private queryBuilderService: QueryBuilderService,
  ) {}

  public async create(createVendorDto: CreateVendorDto, user: User) {
    const [vendor] = await this.db
      .insert(vendors)
      .values({ ...createVendorDto, code: sql`DEFAULT`, createdBy: user.id })
      .returning();
    return vendor; // CreatedBy is not populated here
  }

  public async list(queryParams: QueryParams) {
    return await this.queryBuilderService.execute<Vendor>(vendors, queryParams, {
      filtering: true,
      searchableFields: ['name', 'code', 'email', 'phone'],
      fieldLimiting: true,
      sorting: true,
      pagination: true,
      withRelations: POPULATION,
    });
  }

  public async get(id: string) {
    const vendor = await this.db.query.vendors.findFirst({ where: eq(vendors.id, id), with: POPULATION });
    if (!vendor) throw new NotFoundException(`Vendor with ID ${id} does not exist.`);
    return vendor;
  }

  public async update(id: string, updateVendorDto: UpdateVendorDto) {
    const [updatedVendor] = await this.db.update(vendors).set(updateVendorDto).where(eq(vendors.id, id)).returning();
    if (!updatedVendor) throw new NotFoundException(`Vendor with ID ${id} does not exist.`);
    return updatedVendor;
  }
}
