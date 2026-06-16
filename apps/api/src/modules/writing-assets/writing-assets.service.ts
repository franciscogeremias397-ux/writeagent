import { BadRequestException, Injectable } from "@nestjs/common";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AutoWritingPreset, SavedInspiration, WritingAssetLibrary } from "@shenbi/shared";

type SaveInspirationInput = Partial<Omit<SavedInspiration, "id" | "createdAt" | "updatedAt">>;
type SavePresetInput = Partial<Omit<AutoWritingPreset, "id" | "createdAt" | "updatedAt">>;

@Injectable()
export class WritingAssetsService {
  async listAssets(): Promise<WritingAssetLibrary> {
    return this.readLibrary();
  }

  async saveInspiration(input: SaveInspirationInput = {}) {
    const text = input.text?.trim() ?? "";

    if (!text) {
      throw new BadRequestException("请先写一点灵感内容。");
    }

    const current = await this.readLibrary();
    const now = new Date().toISOString();
    const inspiration: SavedInspiration = {
      id: `inspiration-${Date.now()}`,
      text,
      platform: input.platform?.trim() || "番茄短故事",
      genre: input.genre?.trim() || "女性成长",
      emotion: input.emotion?.trim() || "爽",
      length: input.length?.trim() || "8000 字",
      ending: input.ending?.trim() || "逆袭成功",
      mode: input.mode?.trim() || "步步确认",
      createdAt: now,
      updatedAt: now
    };

    const library = {
      inspirations: [inspiration, ...current.inspirations].slice(0, 50),
      presets: current.presets
    };

    await this.writeLibrary(library);

    return {
      inspiration,
      message: "灵感已保存到本地。"
    };
  }

  async savePreset(input: SavePresetInput = {}) {
    const now = new Date().toISOString();
    const preset: AutoWritingPreset = {
      id: `preset-${Date.now()}`,
      name: input.name?.trim() || `${input.genre?.trim() || "女性成长"}常用参数`,
      platform: input.platform?.trim() || "番茄短故事",
      genre: input.genre?.trim() || "女性成长",
      length: input.length?.trim() || "8000 字",
      emotion: input.emotion?.trim() || "爽",
      protagonist: input.protagonist?.trim() || "县城女性",
      ending: input.ending?.trim() || "逆袭成功",
      style: input.style?.trim() || "现实质感",
      mode: input.mode?.trim() || "步步确认",
      note: input.note?.trim() || "",
      createdAt: now,
      updatedAt: now
    };
    const current = await this.readLibrary();
    const library = {
      inspirations: current.inspirations,
      presets: [preset, ...current.presets].slice(0, 50)
    };

    await this.writeLibrary(library);

    return {
      preset,
      message: "参数模板已保存到本地。"
    };
  }

  async deleteAsset(id: string) {
    const current = await this.readLibrary();
    const library = {
      inspirations: current.inspirations.filter((item) => item.id !== id),
      presets: current.presets.filter((item) => item.id !== id)
    };
    const removed = library.inspirations.length !== current.inspirations.length || library.presets.length !== current.presets.length;

    await this.writeLibrary(library);

    return {
      id,
      removed,
      message: removed ? "已删除这条保存记录。" : "没有找到这条保存记录。"
    };
  }

  async replaceAll(library: Partial<WritingAssetLibrary> = {}) {
    const nextLibrary = this.normalizeLibrary(library);
    await this.writeLibrary(nextLibrary);
    return nextLibrary;
  }

  async clearAll() {
    await this.writeLibrary({ inspirations: [], presets: [] });
  }

  private async readLibrary(): Promise<WritingAssetLibrary> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath(), "utf8")) as Partial<WritingAssetLibrary>;
      return this.normalizeLibrary(parsed);
    } catch {
      return {
        inspirations: [],
        presets: []
      };
    }
  }

  private normalizeLibrary(library: Partial<WritingAssetLibrary>): WritingAssetLibrary {
    return {
      inspirations: (library.inspirations ?? []).filter((item): item is SavedInspiration => Boolean(item.id && item.text)),
      presets: (library.presets ?? []).filter((item): item is AutoWritingPreset => Boolean(item.id && item.name))
    };
  }

  private async writeLibrary(library: WritingAssetLibrary) {
    const filePath = this.filePath();
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      `${JSON.stringify(
        {
          app: "神笔马良短篇小说 Agent",
          updatedAt: new Date().toISOString(),
          inspirations: library.inspirations,
          presets: library.presets
        },
        null,
        2
      )}\n`,
      "utf8"
    );
  }

  private filePath() {
    const cwd = process.cwd();
    const projectRoot = cwd.endsWith(`${path.sep}apps${path.sep}api`) ? path.resolve(cwd, "../..") : cwd;
    return path.resolve(projectRoot, process.env.LOCAL_STORAGE_DIR ?? "storage", "local-data", "writing-assets.json");
  }
}
