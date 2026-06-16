import { Body, Controller, Delete, Get, Inject, Param, Patch, Post } from "@nestjs/common";
import { MemoryService } from "./memory.service.js";

@Controller("memory")
export class MemoryController {
  constructor(@Inject(MemoryService) private readonly memoryService: MemoryService) {}

  @Get()
  listMemory() {
    return this.memoryService.listMemory();
  }

  @Post()
  createMemory(@Body() body: Parameters<MemoryService["createMemory"]>[0]) {
    return this.memoryService.createMemory(body);
  }

  @Patch(":id")
  updateMemory(@Param("id") id: string, @Body() body: Parameters<MemoryService["updateMemory"]>[1]) {
    return this.memoryService.updateMemory(id, body);
  }

  @Delete(":id")
  deleteMemory(@Param("id") id: string) {
    return this.memoryService.deleteMemory(id);
  }
}
