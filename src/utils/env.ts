export const isProductionMode = () => process.env.ENVIRONMENT === 'production';
export const isDevelopmentMode = () => process.env.ENVIRONMENT === 'development';
export const isTestingMode = () => process.env.ENVIRONMENT === 'testing';
