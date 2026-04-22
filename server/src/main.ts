import { Logger } from '@nestjs/common';
import { createNestServer } from './bootstrap';

async function bootstrap() {
  const logger = new Logger('boostrap');
  const app = await createNestServer();
  const port = process.env.PORT || 5000;
  await app.listen(port);
  logger.log('App listening on port ' + port);
}

void bootstrap();
