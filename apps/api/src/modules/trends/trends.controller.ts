import { Controller, Get, Inject, Post } from "@nestjs/common";
import { TrendsService } from "./trends.service.js";

@Controller("trends")
export class TrendsController {
  constructor(@Inject(TrendsService) private readonly trendsService: TrendsService) {}

  @Get()
  listTrends() {
    return this.trendsService.listTrends();
  }

  @Get("today")
  today() {
    return this.trendsService.today();
  }

  @Get("chart")
  chart() {
    return this.trendsService.chart();
  }

  @Post("analyze")
  analyze() {
    return this.trendsService.analyze();
  }
}
