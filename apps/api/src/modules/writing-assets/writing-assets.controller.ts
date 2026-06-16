import { Body, Controller, Delete, Get, Inject, Param, Post } from "@nestjs/common";
import { WritingAssetsService } from "./writing-assets.service.js";

@Controller("writing-assets")
export class WritingAssetsController {
  constructor(@Inject(WritingAssetsService) private readonly writingAssetsService: WritingAssetsService) {}

  @Get()
  listAssets() {
    return this.writingAssetsService.listAssets();
  }

  @Post("inspirations")
  saveInspiration(@Body() body: Parameters<WritingAssetsService["saveInspiration"]>[0]) {
    return this.writingAssetsService.saveInspiration(body);
  }

  @Post("presets")
  savePreset(@Body() body: Parameters<WritingAssetsService["savePreset"]>[0]) {
    return this.writingAssetsService.savePreset(body);
  }

  @Delete(":id")
  deleteAsset(@Param("id") id: string) {
    return this.writingAssetsService.deleteAsset(id);
  }
}
