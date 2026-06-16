import "reflect-metadata";
import "./load-local-env.js";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true
    })
  );

  const port = Number(process.env.PORT ?? 3001);
  const host = process.env.HOST ?? "127.0.0.1";
  await app.listen(port, host);
  console.log(`神笔马良 API 已启动：http://localhost:${port}/api`);
}

bootstrap().catch((error) => {
  console.error("API 启动失败", error);
  process.exit(1);
});
