import { Inject, Injectable } from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';

@Injectable()
export class LocationsService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  public async getLocations() {
    const [countries, governorates, cities] = await Promise.all([
      this.getCountries(),
      this.getGovernorates(),
      this.getCities(),
    ]);

    return { countries, governorates, cities };
  }

  public async getCountries() {
    return this.db.query.countries.findMany();
  }

  public async getGovernorates() {
    return this.db.query.governorates.findMany();
  }

  public async getCities() {
    return this.db.query.cities.findMany();
  }
}
