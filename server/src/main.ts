import { Logger } from '@nestjs/common';
import { createNestServer } from './bootstrap';

async function bootstrap() {
  const logger = new Logger('SJ AURA');
  const app = await createNestServer();
  const port = process.env.PORT || 5000;
  await app.listen(port);
  logger.log(`Aplicación en marcha: escuchando en el puerto ${port} (HTTP).`);
}

void bootstrap();
