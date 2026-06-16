import { Body, Controller, Get, Inject, Param, Post } from "@nestjs/common";
import { ReviewService } from "./review.service.js";

@Controller("review")
export class ReviewController {
  constructor(@Inject(ReviewService) private readonly reviewService: ReviewService) {}

  @Get("work/:id")
  getReview(@Param("id") id: string) {
    return this.reviewService.getReview(id);
  }

  @Post("work/:id")
  createReview(@Param("id") id: string, @Body() body: Parameters<ReviewService["createReview"]>[1]) {
    return this.reviewService.createReview(id, body);
  }
}
