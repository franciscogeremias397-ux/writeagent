import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/shenbi_agent";
    super({
      datasources: {
        db: {
          url: process.env.DATABASE_URL
        }
      }
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
