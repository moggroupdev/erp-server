import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { GlobalExceptionFilter } from 'src/utils/filters/global-exception.filter';
import { isDevelopmentMode } from 'src/utils/env';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  // Create the Nest.js application
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Configure CORS
  app.enableCors({
    origin: JSON.parse(process.env.WHITELIST || '[]') as string[],
    credentials: true, // Required for cookies to be sent cross-origin
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept-Language'],
  });

  // Enable cookie parsing for refresh token handling
  app.use(cookieParser());

  // Enable global validation pipe for DTO validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Ignore non-whitelisted properties (that are not in the DTO)
      forbidNonWhitelisted: true, // Throw an error if non-whitelisted properties are present
      transform: true, // Apply class-transformer decorators (e.g. @Trim)
    }),
  );

  app.useGlobalFilters(new GlobalExceptionFilter());

  // Serve static files from uploads directory
  app.useStaticAssets(join(process.cwd(), 'uploads'));

  // Only enable Swagger in development
  if (isDevelopmentMode()) {
    const swagger = new DocumentBuilder()
      .setVersion('1.0.0')
      .setTitle('MOG ERP API')
      .setDescription('API documentation for the MOG ERP application')
      .addBearerAuth()
      .build();
    const documentation = SwaggerModule.createDocument(app, swagger);
    SwaggerModule.setup('api/docs', app, documentation);
    console.log(`\n` + `📕 Swagger API documentation is accessible at: ${process.env.BASE_URL}/api/docs` + `\n`);
  }

  // Retrieve PORT from environment variables
  const PORT = process.env.PORT;
  if (!PORT) throw new Error('PORT is not defined in environment variables.');

  // Start the application
  await app.listen(PORT);
}

void bootstrap();
