import { Controller, Get } from '@nestjs/common';
import { LocationsService } from './locations.service';

@Controller('locations')
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Get()
  getLocations() {
    return this.locationsService.getLocations();
  }

  @Get('countries')
  getCountries() {
    return this.locationsService.getCountries();
  }

  @Get('governorates')
  getGovernorates() {
    return this.locationsService.getGovernorates();
  }

  @Get('cities')
  getCities() {
    return this.locationsService.getCities();
  }
}
