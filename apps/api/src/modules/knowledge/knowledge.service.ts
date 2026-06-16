import { Inject, Injectable } from "@nestjs/common";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Prisma } from "@prisma/client";
import type { KnowledgeChunk } from "@shenbi/shared";
import { PrismaService } from "../database/prisma.service.js";

export type KnowledgeSourceType = "memory" | "strategy";

export type KnowledgeItem = {
  sourceType: KnowledgeSourceType;
  sourceId: string;
  genre?: string;
  content: string;
  confidence?: number;
  enabled: boolean;
  updatedAt?: string;
};

export type KnowledgeMatch = {
  sourceType: KnowledgeSourceType;
  sourceId: string;
  score: number;
  reason: string;
};

type KnowledgeChunkRecord = {
  id: string;
  sourceType: string;
  sourceId: string;
  genre: string | null;
  content: string;
  embedding: number[];
  metadata: unknown;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type PgVectorMatchRow = {
  sourceType: string;
  sourceId: string;
  score: number | string | null;
};

type LocalKnowledgeChunk = {
  id: string;
  sourceType: KnowledgeSourceType;
  sourceId: string;
  genre: string;
  content: string;
  embedding: number[];
  metadata: Prisma.InputJsonObject;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

const vectorSize = 96;

@Injectable()
export class KnowledgeService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listChunks(): Promise<KnowledgeChunk[]> {
    try {
      const chunks = await this.prisma.knowledgeChunk.findMany({
        orderBy: [{ updatedAt: "desc" }]
      });

      return chunks.map((chunk) => this.toSharedChunk(this.toLocalChunk(chunk as KnowledgeChunkRecord)));
    } catch {
      return (await this.readLocalKnowledgeFile()).map((chunk) => this.toSharedChunk(chunk));
    }
  }

  async replaceAll(chunks: KnowledgeChunk[]) {
    const normalized = chunks
      .map((chunk) => this.normalizeLocalChunk(this.sharedToPartialLocalChunk(chunk)))
      .filter((chunk): chunk is LocalKnowledgeChunk => Boolean(chunk));

    try {
      await this.prisma.knowledgeChunk.deleteMany();
      if (normalized.length) {
        await this.prisma.knowledgeChunk.createMany({
          data: normalized.map((chunk) => ({
            sourceType: chunk.sourceType,
            sourceId: chunk.sourceId,
            genre: chunk.genre,
            content: chunk.content,
            embedding: chunk.embedding,
            metadata: chunk.metadata,
            enabled: chunk.enabled,
            createdAt: new Date(chunk.createdAt),
            updatedAt: new Date(chunk.updatedAt)
          })),
          skipDuplicates: true
        });
        await this.syncPgVectorColumn(normalized).catch(() => undefined);
      }
    } catch {
      await this.writeLocalKnowledgeFile(normalized);
    }
  }

  async retrieve(input: { query: string; items: KnowledgeItem[]; limit?: number }): Promise<KnowledgeMatch[]> {
    const items = this.uniqueItems(input.items.filter((item) => item.enabled && item.content.trim()));
    const query = input.query.trim();

    if (!items.length || !query) {
      return [];
    }

    const chunks = await this.syncAndList(items);
    const activeKeys = new Set(items.map((item) => this.keyOf(item.sourceType, item.sourceId)));
    const queryVector = this.embed(query);
    const pgVectorMatches = await this.pgVectorMatches(queryVector, activeKeys, input.limit ?? 12);

    if (pgVectorMatches.length) {
      return pgVectorMatches;
    }

    const matches = chunks
      .filter((chunk) => chunk.enabled && activeKeys.has(this.keyOf(chunk.sourceType, chunk.sourceId)))
      .map((chunk) => {
        const score = this.cosine(queryVector, chunk.embedding);
        return {
          sourceType: chunk.sourceType,
          sourceId: chunk.sourceId,
          score,
          reason: `知识库相似度 ${Math.round(score * 100)}%`
        };
      })
      .filter((match) => match.score >= 0.08)
      .sort((a, b) => b.score - a.score);

    return matches.slice(0, input.limit ?? 12);
  }

  private async syncAndList(items: KnowledgeItem[]): Promise<LocalKnowledgeChunk[]> {
    const chunks = items.map((item) => this.itemToChunk(item));

    try {
      await Promise.all(
        chunks.map((chunk) =>
          this.prisma.knowledgeChunk.upsert({
            where: {
              sourceType_sourceId: {
                sourceType: chunk.sourceType,
                sourceId: chunk.sourceId
              }
            },
            update: {
              genre: chunk.genre,
              content: chunk.content,
              embedding: chunk.embedding,
              metadata: chunk.metadata,
              enabled: chunk.enabled
            },
            create: {
              sourceType: chunk.sourceType,
              sourceId: chunk.sourceId,
              genre: chunk.genre,
              content: chunk.content,
              embedding: chunk.embedding,
              metadata: chunk.metadata,
              enabled: chunk.enabled,
              createdAt: new Date(chunk.createdAt),
              updatedAt: new Date(chunk.updatedAt)
            }
          })
        )
      );

      await this.syncPgVectorColumn(chunks).catch(() => undefined);

      const dbChunks = await this.prisma.knowledgeChunk.findMany({
        where: {
          OR: chunks.map((chunk) => ({
            sourceType: chunk.sourceType,
            sourceId: chunk.sourceId
          }))
        }
      });

      return dbChunks.map((chunk) => this.toLocalChunk(chunk as KnowledgeChunkRecord));
    } catch {
      const current = await this.readLocalKnowledgeFile();
      const chunkMap = new Map(current.map((chunk) => [this.keyOf(chunk.sourceType, chunk.sourceId), chunk]));

      for (const chunk of chunks) {
        chunkMap.set(this.keyOf(chunk.sourceType, chunk.sourceId), chunk);
      }

      const nextChunks = [...chunkMap.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      await this.writeLocalKnowledgeFile(nextChunks);

      return nextChunks;
    }
  }

  private async pgVectorMatches(queryVector: number[], activeKeys: Set<string>, limit: number): Promise<KnowledgeMatch[]> {
    try {
      const rows = await this.prisma.$queryRawUnsafe<PgVectorMatchRow[]>(
        `SELECT "sourceType",
                "sourceId",
                GREATEST(0, LEAST(1, 1 - ("embeddingVector" <=> $1::vector))) AS score
           FROM "KnowledgeChunk"
          WHERE "enabled" = true
            AND "embeddingVector" IS NOT NULL
          ORDER BY "embeddingVector" <=> $1::vector
          LIMIT $2`,
        this.vectorLiteral(queryVector),
        Math.max(limit * 3, limit)
      );

      return rows
        .map((row) => ({
          sourceType: this.toSourceType(row.sourceType),
          sourceId: row.sourceId,
          score: this.toScore(row.score),
          reason: `pgvector 相似度 ${Math.round(this.toScore(row.score) * 100)}%`
        }))
        .filter((match) => activeKeys.has(this.keyOf(match.sourceType, match.sourceId)) && match.score >= 0.08)
        .slice(0, limit);
    } catch {
      return [];
    }
  }

  private async syncPgVectorColumn(chunks: LocalKnowledgeChunk[]) {
    if (!chunks.length) {
      return;
    }

    await Promise.all(
      chunks.map((chunk) =>
        this.prisma.$executeRawUnsafe(
          `UPDATE "KnowledgeChunk"
              SET "embeddingVector" = $1::vector
            WHERE "sourceType" = $2
              AND "sourceId" = $3`,
          this.vectorLiteral(chunk.embedding),
          chunk.sourceType,
          chunk.sourceId
        )
      )
    );
  }

  private itemToChunk(item: KnowledgeItem): LocalKnowledgeChunk {
    const now = new Date().toISOString();
    const updatedAt = item.updatedAt ? new Date(item.updatedAt).toISOString() : now;

    return {
      id: `knowledge-${item.sourceType}-${item.sourceId}`,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      genre: item.genre ?? "通用",
      content: item.content.trim(),
      embedding: this.embed(`${item.genre ?? ""} ${item.content}`),
      metadata: {
        confidence: item.confidence ?? 70
      },
      enabled: item.enabled,
      createdAt: updatedAt,
      updatedAt
    };
  }

  private toLocalChunk(chunk: KnowledgeChunkRecord): LocalKnowledgeChunk {
    return {
      id: chunk.id,
      sourceType: this.toSourceType(chunk.sourceType),
      sourceId: chunk.sourceId,
      genre: chunk.genre ?? "通用",
      content: chunk.content,
      embedding: chunk.embedding,
      metadata: this.toMetadata(chunk.metadata),
      enabled: chunk.enabled,
      createdAt: chunk.createdAt.toISOString(),
      updatedAt: chunk.updatedAt.toISOString()
    };
  }

  private toSharedChunk(chunk: LocalKnowledgeChunk): KnowledgeChunk {
    return {
      ...chunk,
      metadata: chunk.metadata as Record<string, unknown>
    };
  }

  private sharedToPartialLocalChunk(chunk: KnowledgeChunk): Partial<LocalKnowledgeChunk> {
    return {
      ...chunk,
      metadata: this.toMetadata(chunk.metadata)
    };
  }

  private embed(text: string) {
    const vector = Array.from({ length: vectorSize }, () => 0);
    const tokens = this.tokenize(text);

    for (const token of tokens) {
      const hash = this.hash(token);
      const index = Math.abs(hash) % vectorSize;
      const sign = hash % 2 === 0 ? 1 : -1;
      const weight = Math.min(3, Math.max(1, token.length / 2));
      vector[index] += sign * weight;
    }

    return this.normalize(vector);
  }

  private tokenize(text: string) {
    const normalized = text.toLowerCase();
    const stopTokens = new Set(["一个", "这个", "那个", "故事", "主角", "女主", "平台", "写作", "作品", "读者", "可以", "需要"]);
    const tokens = new Set<string>();

    for (const word of normalized.split(/[^\p{L}\p{N}]+/u)) {
      if (word.length >= 2 && !stopTokens.has(word)) {
        tokens.add(word);
      }
    }

    for (const run of normalized.match(/[\u4e00-\u9fff]{2,}/g) ?? []) {
      for (const size of [2, 3, 4]) {
        for (let index = 0; index <= run.length - size; index += 1) {
          const token = run.slice(index, index + size);

          if (!stopTokens.has(token)) {
            tokens.add(token);
          }
        }
      }
    }

    return [...tokens];
  }

  private normalize(vector: number[]) {
    const length = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));

    if (!length) {
      return vector;
    }

    return vector.map((value) => Number((value / length).toFixed(6)));
  }

  private cosine(left: number[], right: number[]) {
    const size = Math.min(left.length, right.length);
    let score = 0;

    for (let index = 0; index < size; index += 1) {
      score += left[index] * right[index];
    }

    return Math.max(0, Math.min(1, score));
  }

  private vectorLiteral(vector: number[]) {
    return `[${vector.map((value) => (Number.isFinite(value) ? Number(value).toFixed(6) : "0")).join(",")}]`;
  }

  private toScore(value: PgVectorMatchRow["score"]) {
    const score = typeof value === "number" ? value : Number(value ?? 0);
    return Math.max(0, Math.min(1, Number.isFinite(score) ? score : 0));
  }

  private hash(value: string) {
    let hash = 5381;

    for (let index = 0; index < value.length; index += 1) {
      hash = (hash * 33) ^ value.charCodeAt(index);
    }

    return hash;
  }

  private uniqueItems(items: KnowledgeItem[]) {
    const seen = new Set<string>();

    return items.filter((item) => {
      const key = this.keyOf(item.sourceType, item.sourceId);
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }

  private toSourceType(value: string): KnowledgeSourceType {
    return value === "strategy" ? "strategy" : "memory";
  }

  private toMetadata(value: unknown): Prisma.InputJsonObject {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Prisma.InputJsonObject) : {};
  }

  private keyOf(sourceType: string, sourceId: string) {
    return `${sourceType}:${sourceId}`;
  }

  private async readLocalKnowledgeFile(): Promise<LocalKnowledgeChunk[]> {
    try {
      const parsed = JSON.parse(await readFile(this.localKnowledgeFilePath(), "utf8")) as {
        chunks?: Partial<LocalKnowledgeChunk>[];
      };

      return (parsed.chunks ?? [])
        .map((chunk) => this.normalizeLocalChunk(chunk))
        .filter((chunk): chunk is LocalKnowledgeChunk => Boolean(chunk));
    } catch {
      return [];
    }
  }

  private async writeLocalKnowledgeFile(chunks: LocalKnowledgeChunk[]) {
    const filePath = this.localKnowledgeFilePath();
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      `${JSON.stringify(
        {
          app: "神笔马良短篇小说 Agent",
          updatedAt: new Date().toISOString(),
          vectorSize,
          chunks
        },
        null,
        2
      )}\n`,
      "utf8"
    );
  }

  private normalizeLocalChunk(chunk: Partial<LocalKnowledgeChunk>): LocalKnowledgeChunk | null {
    if (!chunk.sourceId || !chunk.content?.trim() || !chunk.embedding?.length) {
      return null;
    }

    const now = new Date().toISOString();
    const sourceType = this.toSourceType(chunk.sourceType ?? "memory");

    return {
      id: chunk.id ?? `knowledge-${sourceType}-${chunk.sourceId}`,
      sourceType,
      sourceId: chunk.sourceId,
      genre: chunk.genre ?? "通用",
      content: chunk.content.trim(),
      embedding: chunk.embedding,
      metadata: this.toMetadata(chunk.metadata),
      enabled: chunk.enabled ?? true,
      createdAt: chunk.createdAt ?? now,
      updatedAt: chunk.updatedAt ?? now
    };
  }

  private localKnowledgeFilePath() {
    const cwd = process.cwd();
    const projectRoot = cwd.endsWith(`${path.sep}apps${path.sep}api`) ? path.resolve(cwd, "../..") : cwd;
    return path.resolve(projectRoot, process.env.LOCAL_STORAGE_DIR ?? "storage", "local-data", "knowledge-index.json");
  }
}
