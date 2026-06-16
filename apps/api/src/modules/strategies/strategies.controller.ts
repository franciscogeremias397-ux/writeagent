import { Body, Controller, Delete, Get, Inject, Param, Patch, Post } from "@nestjs/common";
import { StrategiesService } from "./strategies.service.js";

@Controller("strategies")
export class StrategiesController {
  constructor(@Inject(StrategiesService) private readonly strategiesService: StrategiesService) {}

  @Get()
  listStrategies() {
    return this.strategiesService.listStrategies();
  }

  @Post()
  createStrategy(@Body() body: Parameters<StrategiesService["createStrategy"]>[0]) {
    return this.strategiesService.createStrategy(body);
  }

  @Patch(":id")
  updateStrategy(@Param("id") id: string, @Body() body: Parameters<StrategiesService["updateStrategy"]>[1]) {
    return this.strategiesService.updateStrategy(id, body);
  }

  @Delete(":id")
  deleteStrategy(@Param("id") id: string) {
    return this.strategiesService.deleteStrategy(id);
  }
}
