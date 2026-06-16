"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mark, mergeAttributes } from "@tiptap/core";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Bot,
  Check,
  Copy,
  Heading1,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Pilcrow,
  Plus,
  Quote,
  Redo2,
  RefreshCw,
  RotateCcw,
  Save,
  Strikethrough,
  Trash2,
  Undo2
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { generateStoryPlan, type ApplyRewriteResult, type EditorVersionRecord, type MarkType, type RewriteSuggestion, type Work } from "@shenbi/shared";
import { Badge, Button, Card, CardHeader, GhostButton, SelectInput } from "@/components/ui";
import {
  applyEditorRewrite,
  createEditorMark,
  createRewriteSuggestion,
  deleteEditorMark,
  getEditorMarks,
  getEditorVersions,
  getWorks,
  saveWorkFullText
} from "@/lib/api";
import { copyPlainText } from "@/lib/clipboard";

type EditorMark = {
  id: string;
  label: string;
  index: number;
  type: MarkType;
  selectedText: string;
  comment: string;
  startOffset: number;
  endOffset: number;
};

type VersionRecord = {
  id: string;
  markLabel: string;
  originalText: string;
  newText: string;
  reason: string;
  impactNotes: string[];
  persisted: boolean;
  diff?: ApplyRewriteResult["diff"];
  memory?: ApplyRewriteResult["memory"];
  createdAt: string;
};

type MemoryUpdateOption = {
  id: string;
  label: string;
  note: string;
  recommended: boolean;
};

type FormatButtonProps = {
  label: string;
  icon: LucideIcon;
  active?: boolean;
  disabled?: boolean;
  onRun: () => void;
};

const StoryMark = Mark.create({
  name: "storyMark",
  addAttributes() {
    return {
      markId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-story-mark"),
        renderHTML: (attributes: { markId?: string }) => {
          if (!attributes.markId) {
            return {};
          }

          return { "data-story-mark": attributes.markId };
        }
      },
      markType: {
        default: "optimize",
        parseHTML: (element) => element.getAttribute("data-mark-type"),
        renderHTML: (attributes: { markType?: string }) => {
          if (!attributes.markType) {
            return {};
          }

          return { "data-mark-type": attributes.markType };
        }
      }
    };
  },
  parseHTML() {
    return [{ tag: "span[data-story-mark]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { class: "story-mark" }), 0];
  }
});

const markTypes: Array<{ value: MarkType; label: string }> = [
  { value: "delete", label: "删除" },
  { value: "optimize", label: "优化" },
  { value: "rewrite", label: "重写" },
  { value: "logic", label: "逻辑问题" },
  { value: "emotion", label: "情绪问题" },
  { value: "rhythm", label: "节奏问题" },
  { value: "character", label: "人物问题" },
  { value: "information_gap", label: "信息差问题" },
  { value: "scene_goal", label: "场景目标问题" }
];

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function draftToHtml(value: string) {
  return value
    .split("\n")
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");
}

function countText(value: string) {
  return value.replace(/\s+/g, "").length;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mentionPattern(label: string) {
  return new RegExp(`@${escapeRegExp(label)}(?=\\s|$)`, "u");
}

function workToDraft(work: Work | undefined, fallbackDraft: string) {
  if (!work) {
    return fallbackDraft;
  }

  if (work.fullText?.trim()) {
    return work.fullText.trim();
  }

  const tags = [...work.genreTags, ...work.styleTags].filter(Boolean).join("、") || "短篇小说";

  return `${work.summary}

题名：《${work.title}》

题材方向：${tags}

这是当前作品的正文草稿占位。你可以继续扩写，也可以选中某一段让 Agent 局部改稿。`;
}

function editorText(editor: Editor) {
  return editor.state.doc.textBetween(0, editor.state.doc.content.size, "\n\n").trim();
}

function applyStoredMarks(editor: Editor, marks: EditorMark[]) {
  const docSize = editor.state.doc.content.size;

  marks.forEach((mark) => {
    const from = Math.max(1, Math.min(mark.startOffset, docSize));
    const to = Math.max(from, Math.min(mark.endOffset, docSize));

    if (to > from) {
      editor.chain().setTextSelection({ from, to }).setMark("storyMark", { markId: mark.id, markType: mark.type }).run();
    }
  });
}

export function EditorWorkspace() {
  const fallbackPlan = useMemo(() => generateStoryPlan(), []);
  const [works, setWorks] = useState<Work[]>([]);
  const [selectedWorkId, setSelectedWorkId] = useState("");
  const [marks, setMarks] = useState<EditorMark[]>([]);
  const [selectedType, setSelectedType] = useState<MarkType>("optimize");
  const [feedback, setFeedback] = useState("@标记1 这段情节太狗血了，降低夸张感，改成更真实的家庭冲突。");
  const [activeSuggestion, setActiveSuggestion] = useState<RewriteSuggestion | null>(null);
  const [versions, setVersions] = useState<VersionRecord[]>([]);
  const [lastApplyResult, setLastApplyResult] = useState<ApplyRewriteResult | null>(null);
  const [notice, setNotice] = useState("选中正文后可以添加标记。");
  const [saveStatus, setSaveStatus] = useState("自动保存已准备好。");
  const [rewritingMarkId, setRewritingMarkId] = useState<string | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [draftLength, setDraftLength] = useState(() => countText(fallbackPlan.draft));
  const [memoryUpdateEnabled, setMemoryUpdateEnabled] = useState(true);
  const [selectedMemoryUpdateIds, setSelectedMemoryUpdateIds] = useState<string[]>([]);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingWorkRef = useRef(false);
  const loadedWorkIdRef = useRef("");
  const selectedWorkIdRef = useRef("");

  const selectedWork = useMemo(() => works.find((work) => work.id === selectedWorkId) ?? works[0], [selectedWorkId, works]);
  const currentDraft = useMemo(() => workToDraft(selectedWork, fallbackPlan.draft), [fallbackPlan.draft, selectedWork]);
  const structurePlan = useMemo(() => selectedWork?.storyPlan ?? fallbackPlan, [fallbackPlan, selectedWork]);
  const sceneCards = structurePlan.sceneCards.length ? structurePlan.sceneCards : fallbackPlan.sceneCards;
  const characters = structurePlan.characters.length ? structurePlan.characters : fallbackPlan.characters;
  const activeSuggestionMark = activeSuggestion ? marks.find((mark) => mark.id === activeSuggestion.markId) : null;
  const memoryUpdateOptions = useMemo(
    () => (activeSuggestion ? buildMemoryUpdateOptions(activeSuggestion, activeSuggestionMark, selectedWork) : []),
    [activeSuggestion, activeSuggestionMark, selectedWork]
  );
  const selectedMemoryNotes = useMemo(
    () => memoryUpdateOptions.filter((option) => selectedMemoryUpdateIds.includes(option.id)).map((option) => option.note),
    [memoryUpdateOptions, selectedMemoryUpdateIds]
  );
  const mentionMatch = useMemo(() => feedback.match(/@([^\s@]*)$/u), [feedback]);
  const mentionQuery = mentionMatch?.[1]?.toLowerCase() ?? "";
  const mentionedMark = useMemo(() => marks.find((mark) => mentionPattern(mark.label).test(feedback)) ?? null, [feedback, marks]);
  const visibleMentionMarks = useMemo(
    () =>
      marks.filter((mark) => {
        if (!mentionMatch) {
          return false;
        }

        const typeLabel = markTypes.find((type) => type.value === mark.type)?.label ?? "";
        const searchable = `${mark.label} ${typeLabel} ${mark.selectedText}`.toLowerCase();

        return !mentionQuery || searchable.includes(mentionQuery);
      }),
    [mentionMatch, mentionQuery, marks]
  );

  const persistDraft = useCallback(
    async (workId: string, fullText: string, mode: "auto" | "manual" = "auto") => {
      if (!workId || !fullText.trim()) {
        return;
      }

      setSaveStatus(mode === "auto" ? "正在自动保存正文。" : "正在保存正文。");

      try {
        const result = await saveWorkFullText(workId, fullText);
        setWorks((current) => current.map((work) => (work.id === workId ? result.work : work)));
        setSaveStatus(result.persisted ? "正文已自动保存到本地数据库。" : "正文已自动保存到本地文件。");
      } catch (error) {
        setSaveStatus(error instanceof Error ? error.message : "自动保存失败，请稍后再试。");
      }
    },
    []
  );

  const editor = useEditor({
    extensions: [StarterKit, StoryMark],
    content: draftToHtml(fallbackPlan.draft),
    immediatelyRender: false,
    onUpdate: ({ editor: currentEditor }) => {
      const fullText = editorText(currentEditor);
      setDraftLength(countText(fullText));

      if (loadingWorkRef.current) {
        return;
      }

      setSaveStatus("有修改，稍后自动保存。");

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

      saveTimerRef.current = setTimeout(() => {
        void persistDraft(selectedWorkIdRef.current, fullText);
      }, 900);
    },
    editorProps: {
      attributes: {
        class: "rounded-md bg-white px-5 py-5 text-[15px] leading-8 text-ink"
      }
    }
  });

  useEffect(() => {
    let alive = true;

    getWorks()
      .then((items) => {
        if (!alive) {
          return;
        }

        const requestedWorkId = new URLSearchParams(window.location.search).get("workId") ?? "";
        setWorks(items);
        setSelectedWorkId((current) => {
          if (current && items.some((work) => work.id === current)) {
            return current;
          }

          if (requestedWorkId && items.some((work) => work.id === requestedWorkId)) {
            return requestedWorkId;
          }

          return items[0]?.id ?? "";
        });
        setNotice(items.length > 0 ? "已读取作品列表，可以切换不同作品继续改稿。" : "还没有保存过作品，先打开一篇示例稿。");
      })
      .catch(() => {
        if (alive) {
          setNotice("暂时没读到作品列表，先打开一篇示例稿。");
        }
      });

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedWorkId) {
      return;
    }

    selectedWorkIdRef.current = selectedWorkId;

    const url = new URL(window.location.href);
    if (url.searchParams.get("workId") === selectedWorkId) {
      return;
    }

    url.searchParams.set("workId", selectedWorkId);
    window.history.replaceState(null, "", `${url.pathname}?${url.searchParams.toString()}`);
  }, [selectedWorkId]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    if (selectedWorkId && loadedWorkIdRef.current === selectedWorkId) {
      return;
    }

    loadingWorkRef.current = true;
    editor.commands.setContent(draftToHtml(currentDraft));
    loadedWorkIdRef.current = selectedWorkId;
    setDraftLength(countText(currentDraft));
    setActiveSuggestion(null);
    setLastApplyResult(null);
    setSaveStatus(selectedWork ? "正文已读取，自动保存已准备好。" : "示例稿不会自动保存。");
    const loadingTimer = window.setTimeout(() => {
      loadingWorkRef.current = false;
    }, 0);
    return () => window.clearTimeout(loadingTimer);
  }, [currentDraft, editor, selectedWork, selectedWorkId]);

  useEffect(
    () => () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (!selectedWork?.id || !editor) {
      return;
    }

    let alive = true;
    setMarks([]);
    setVersions([]);

    Promise.all([getEditorMarks(selectedWork.id), getEditorVersions(selectedWork.id)])
      .then(([savedMarks, savedVersions]) => {
        if (!alive) {
          return;
        }

        const nextMarks = savedMarks.map((mark) => ({
          id: mark.id,
          label: mark.label,
          index: mark.index,
          type: mark.type,
          selectedText: mark.selectedText,
          comment: mark.comment,
          startOffset: mark.startOffset,
          endOffset: mark.endOffset
        }));

        setMarks(nextMarks);
        setVersions(savedVersions.map((version) => toVersionRecord(version)));
        applyStoredMarks(editor, nextMarks);
        if (savedMarks.length || savedVersions.length) {
          setNotice(`已读取《${selectedWork.title}》保存过的标记和版本历史。`);
        }
      })
      .catch(() => undefined);

    return () => {
      alive = false;
    };
  }, [editor, selectedWork]);

  useEffect(() => {
    if (!activeSuggestion) {
      setMemoryUpdateEnabled(true);
      setSelectedMemoryUpdateIds([]);
      return;
    }

    setMemoryUpdateEnabled(true);
    setSelectedMemoryUpdateIds(memoryUpdateOptions.filter((option) => option.recommended).map((option) => option.id));
  }, [activeSuggestion, memoryUpdateOptions]);

  async function addMark() {
    if (!editor) {
      return;
    }

    if (!selectedWork?.id) {
      setNotice("作品还在读取中，稍等一下再添加标记。");
      return;
    }

    const { from, to, empty } = editor.state.selection;
    if (empty) {
      setNotice("先在正文里选中一小段文字，再添加标记。");
      return;
    }

    const selectedText = editor.state.doc.textBetween(from, to, " ").trim();
    const index = Math.max(0, ...marks.map((mark) => mark.index)) + 1;
    const label = `标记${index}`;
    setNotice(`${label} 正在保存。`);

    try {
      const savedMark = await createEditorMark({
        workId: selectedWork.id,
        label,
        index,
        type: selectedType,
        selectedText,
        startOffset: from,
        endOffset: to
      });

      editor.chain().focus().setTextSelection({ from, to }).setMark("storyMark", { markId: savedMark.id, markType: selectedType }).run();
      setMarks((current) => [
        ...current,
        {
          id: savedMark.id,
          label: savedMark.label,
          index: savedMark.index,
          type: savedMark.type,
          selectedText: savedMark.selectedText,
          comment: savedMark.comment,
          startOffset: savedMark.startOffset,
          endOffset: savedMark.endOffset
        }
      ]);
      setFeedback(`@${savedMark.label} `);
      setNotice(savedMark.persisted ? `${savedMark.label} 已保存到本地数据库。` : `${savedMark.label} 已添加；数据库未连接，已保存到本地文件。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "标记保存失败，请稍后再试。");
    }
  }

  async function saveCurrentDraft() {
    if (!editor || !selectedWork?.id) {
      setSaveStatus("请先选择一部已保存作品，再保存正文。");
      return;
    }

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    setIsSavingDraft(true);

    try {
      await persistDraft(selectedWork.id, editorText(editor), "manual");
    } finally {
      setIsSavingDraft(false);
    }
  }

  async function copyCurrentDraft() {
    if (!editor) {
      setSaveStatus("正文还没准备好，稍等一下再复制。");
      return;
    }

    const fullText = editorText(editor);
    if (!fullText.trim()) {
      setSaveStatus("正文还是空的，暂时没有可复制内容。");
      return;
    }

    try {
      await copyPlainText(fullText);
      setSaveStatus(`正文已复制，约 ${countText(fullText).toLocaleString("zh-CN")} 字，可以去平台后台粘贴。`);
    } catch {
      editor.chain().focus().selectAll().run();
      setSaveStatus("浏览器没有允许自动复制，已帮你选中正文，请按 Command+C 复制。");
    }
  }

  function removeEditorMark(markId: string) {
    if (!editor) {
      return;
    }

    editor
      .chain()
      .focus()
      .command(({ tr, state, dispatch }) => {
        const markType = state.schema.marks.storyMark;
        state.doc.descendants((node, pos) => {
          if (!node.isText) {
            return;
          }

          const hasMark = node.marks.some((mark) => mark.type === markType && mark.attrs.markId === markId);
          if (hasMark) {
            tr.removeMark(pos, pos + node.nodeSize, markType);
          }
        });
        dispatch?.(tr);
        return true;
      })
      .run();
  }

  async function deleteMark(markId: string) {
    const response = await deleteEditorMark(markId).catch(() => null);
    removeEditorMark(markId);
    setMarks((current) => current.filter((mark) => mark.id !== markId));
    if (activeSuggestion?.markId === markId) {
      setActiveSuggestion(null);
    }
    setNotice(response?.message ?? "标记已删除，正文高亮也已取消。");
  }

  async function requestRewrite(mark: EditorMark) {
    setRewritingMarkId(mark.id);
    setNotice(`${mark.label} 正在生成改稿建议。`);

    try {
      const suggestion = await createRewriteSuggestion({
        markId: mark.id,
        selectedText: mark.selectedText,
        feedback: feedback.replace(`@${mark.label}`, "").trim()
      });
      setActiveSuggestion(suggestion);
      setNotice(`${mark.label} 的改稿建议已生成。`);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "改稿失败，请稍后再试。");
    } finally {
      setRewritingMarkId(null);
    }
  }

  function insertMention(mark: EditorMark) {
    setFeedback((current) => {
      if (/@([^\s@]*)$/u.test(current)) {
        return current.replace(/@([^\s@]*)$/u, `@${mark.label} `);
      }

      return `${current.trimEnd()} @${mark.label} `;
    });
  }

  function requestMentionedRewrite() {
    if (!mentionedMark) {
      setNotice("请先在反馈框里输入 @ 并选择一个标记。");
      return;
    }

    void requestRewrite(mentionedMark);
  }

  function toggleMemoryUpdateOption(id: string) {
    setSelectedMemoryUpdateIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function applySuggestion() {
    if (!editor || !activeSuggestion || !selectedWork?.id) {
      return;
    }

    const mark = marks.find((item) => item.id === activeSuggestion.markId);
    if (!mark) {
      return;
    }

    editor
      .chain()
      .focus()
      .command(({ tr, state, dispatch }) => {
        const markType = state.schema.marks.storyMark;
        let from = Number.POSITIVE_INFINITY;
        let to = 0;

        state.doc.descendants((node, pos) => {
          if (!node.isText) {
            return;
          }

          const hasMark = node.marks.some((nodeMark) => nodeMark.type === markType && nodeMark.attrs.markId === activeSuggestion.markId);
          if (hasMark) {
            from = Math.min(from, pos);
            to = Math.max(to, pos + node.nodeSize);
          }
        });

        if (from !== Number.POSITIVE_INFINITY && to > from) {
          tr.insertText(activeSuggestion.newText, from, to);
        }

        dispatch?.(tr);
        return true;
      })
      .run();

    const fullText = editorText(editor);
    const shouldUpdateMemory = memoryUpdateEnabled && selectedMemoryNotes.length > 0;
    const versionImpactNotes = shouldUpdateMemory ? selectedMemoryNotes : ["本次未更新作品记忆。"];
    const applyResult = await applyEditorRewrite({
      workId: selectedWork.id,
      markId: mark.id,
      markLabel: mark.label,
      originalText: mark.selectedText,
      newText: activeSuggestion.newText,
      reason: activeSuggestion.strategy,
      impactNotes: versionImpactNotes,
      updateMemory: shouldUpdateMemory,
      fullText
    }).catch(() => null);
    const appliedVersion = applyResult?.version;

    setWorks((current) =>
      current.map((work) =>
        work.id === selectedWork.id
          ? {
              ...work,
              fullText,
              wordCount: countText(fullText),
              updatedAt: new Date().toISOString().slice(0, 10)
            }
          : work
      )
    );
    setLastApplyResult(applyResult);
    setVersions((current) => [
      applyResult ? toVersionRecord(applyResult.version, applyResult) : createLocalVersionRecord(current.length + 1, mark, activeSuggestion, versionImpactNotes),
      ...current
    ]);
    setMarks((current) => current.filter((item) => item.id !== activeSuggestion.markId));
    setActiveSuggestion(null);
    setNotice(
      applyResult?.message ??
        (shouldUpdateMemory ? "新版片段已应用到页面，但保存回执暂时不可用，写作记忆未确认沉淀。" : "新版片段已应用到页面，但保存回执暂时不可用。")
    );
    setSaveStatus(
      appliedVersion?.persisted
        ? "正文已随改稿保存到本地数据库。"
        : applyResult
          ? "正文已随改稿保存到本地文件。"
          : "正文已更新，自动保存会继续尝试写入本地。"
    );
  }

  function jumpToScene(title: string) {
    if (!editor) {
      return;
    }

    const fullText = editorText(editor);
    const index = fullText.indexOf(title);

    if (index < 0) {
      setNotice(`正文里暂时没有找到“${title}”，可以手动搜索这一场。`);
      return;
    }

    const position = Math.max(1, Math.min(index + 1, editor.state.doc.content.size));
    editor.chain().focus().setTextSelection(position).run();
    setNotice(`已定位到场景：${title}`);
  }

  const mentionOpen = Boolean(mentionMatch);

  return (
    <div className="mx-auto grid max-w-[1500px] gap-6">
      <section>
        <p className="mb-2 text-sm text-muted">正文编辑器 / 标记改稿</p>
        <h1 className="text-3xl font-semibold">边读边标记，让 Agent 只改需要改的地方</h1>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted">当前作品</span>
          <SelectInput value={selectedWork?.id ?? ""} onChange={(event) => setSelectedWorkId(event.target.value)} disabled={works.length === 0}>
            {works.length === 0 ? <option value="">示例稿</option> : null}
            {works.map((work) => (
              <option key={work.id} value={work.id}>
                {work.title}
              </option>
            ))}
          </SelectInput>
          {selectedWork ? (
            <>
              <Badge>{selectedWork.platform}</Badge>
              <Badge>{selectedWork.status === "draft" ? "草稿" : selectedWork.status === "published" ? "已发布" : "连载中"}</Badge>
            </>
          ) : null}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[250px_1fr_360px]">
        <Card className="h-fit">
          <CardHeader title="结构参考" />
          <div className="grid gap-2 p-4">
            {sceneCards.map((scene) => (
              <button key={scene.id} className="rounded-md border border-line bg-white p-3 text-left text-sm hover:border-ink" onClick={() => jumpToScene(scene.title)}>
                <p className="font-medium">场景 {scene.index}</p>
                <p className="mt-1 text-muted">{scene.title}</p>
              </button>
            ))}
          </div>
          <div className="border-t border-line p-4">
            <p className="mb-3 text-sm font-medium">人物卡</p>
            <div className="grid gap-2">
              {characters.map((character) => (
                <Badge key={character.id}>{character.name} · {character.role}</Badge>
              ))}
            </div>
          </div>
        </Card>

        <Card className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <p className="text-xs text-muted">{selectedWork?.title ?? fallbackPlan.title}</p>
              <h2 className="text-base font-semibold">正文草稿</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <SelectInput value={selectedType} onChange={(event) => setSelectedType(event.target.value as MarkType)}>
                {markTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </SelectInput>
              <GhostButton onClick={saveCurrentDraft} disabled={!selectedWork?.id || !editor || isSavingDraft}>
                <Save size={16} />
                {isSavingDraft ? "保存中" : "保存正文"}
              </GhostButton>
              <GhostButton onClick={copyCurrentDraft} disabled={!editor}>
                <Copy size={16} />
                复制正文
              </GhostButton>
              <Button onClick={addMark}>
                <Plus size={16} />
                添加标记
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-paper px-5 py-3" aria-label="正文基础排版工具">
            <FormatButton label="段落" icon={Pilcrow} active={editor?.isActive("paragraph") ?? false} disabled={!editor} onRun={() => editor?.chain().focus().setParagraph().run()} />
            <FormatButton
              label="一级标题"
              icon={Heading1}
              active={editor?.isActive("heading", { level: 1 }) ?? false}
              disabled={!editor}
              onRun={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
            />
            <FormatButton
              label="二级标题"
              icon={Heading2}
              active={editor?.isActive("heading", { level: 2 }) ?? false}
              disabled={!editor}
              onRun={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
            />
            <span className="mx-1 h-6 w-px bg-line" aria-hidden="true" />
            <FormatButton label="加粗" icon={Bold} active={editor?.isActive("bold") ?? false} disabled={!editor} onRun={() => editor?.chain().focus().toggleBold().run()} />
            <FormatButton label="斜体" icon={Italic} active={editor?.isActive("italic") ?? false} disabled={!editor} onRun={() => editor?.chain().focus().toggleItalic().run()} />
            <FormatButton
              label="删除线"
              icon={Strikethrough}
              active={editor?.isActive("strike") ?? false}
              disabled={!editor}
              onRun={() => editor?.chain().focus().toggleStrike().run()}
            />
            <span className="mx-1 h-6 w-px bg-line" aria-hidden="true" />
            <FormatButton
              label="无序列表"
              icon={List}
              active={editor?.isActive("bulletList") ?? false}
              disabled={!editor}
              onRun={() => editor?.chain().focus().toggleBulletList().run()}
            />
            <FormatButton
              label="有序列表"
              icon={ListOrdered}
              active={editor?.isActive("orderedList") ?? false}
              disabled={!editor}
              onRun={() => editor?.chain().focus().toggleOrderedList().run()}
            />
            <FormatButton
              label="引用"
              icon={Quote}
              active={editor?.isActive("blockquote") ?? false}
              disabled={!editor}
              onRun={() => editor?.chain().focus().toggleBlockquote().run()}
            />
            <span className="mx-1 h-6 w-px bg-line" aria-hidden="true" />
            <FormatButton label="撤销" icon={Undo2} disabled={!editor} onRun={() => editor?.chain().focus().undo().run()} />
            <FormatButton label="重做" icon={Redo2} disabled={!editor} onRun={() => editor?.chain().focus().redo().run()} />
          </div>
          <div className="p-5">
            <div className="rounded-lg border border-line bg-white">
              <EditorContent editor={editor} />
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
              <span>{notice}</span>
              <span>字数约 {draftLength.toLocaleString("zh-CN")}</span>
            </div>
            <p className="mt-2 text-xs text-muted">{saveStatus}</p>
          </div>
        </Card>

        <aside className="grid gap-5">
          <Card>
            <CardHeader title={`标记列表（${marks.length}）`} />
            <div className="grid gap-3 p-4">
              {marks.length === 0 ? (
                <p className="text-sm leading-7 text-muted">还没有标记。选中正文里的问题片段后点击添加标记。</p>
              ) : (
                marks.map((mark) => (
                  <div key={mark.id} className="rounded-md border border-line bg-white p-4">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <Badge>{mark.label}</Badge>
                      <button className="text-muted hover:text-ink" onClick={() => deleteMark(mark.id)} aria-label="删除标记">
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <p className="line-clamp-3 text-sm leading-6 text-muted">{mark.selectedText}</p>
                    <Button className="mt-3 w-full" onClick={() => requestRewrite(mark)} disabled={rewritingMarkId === mark.id}>
                      <Bot size={16} />
                      {rewritingMarkId === mark.id ? "生成中..." : "生成局部改稿"}
                    </Button>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="@标记 反馈" />
            <div className="grid gap-3 p-4">
              <div className="relative">
                <textarea
                  value={feedback}
                  onChange={(event) => setFeedback(event.target.value)}
                  className="min-h-28 w-full resize-none rounded-md border border-line bg-white p-3 text-sm leading-6 outline-none focus:border-ink"
                />
                {mentionOpen && visibleMentionMarks.length > 0 ? (
                  <div className="absolute left-3 top-11 z-10 grid w-[calc(100%-24px)] gap-1 rounded-md border border-line bg-white p-2 shadow-soft">
                    {visibleMentionMarks.map((mark) => (
                      <button
                        key={mark.id}
                        className="rounded px-2 py-1 text-left text-sm hover:bg-paper"
                        onClick={() => insertMention(mark)}
                      >
                        {mark.label} · {markTypes.find((type) => type.value === mark.type)?.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              {mentionedMark ? (
                <div className="rounded-md border border-line bg-paper p-3 text-xs leading-5 text-muted">
                  已选择 {mentionedMark.label}：{mentionedMark.selectedText.slice(0, 56)}
                  {mentionedMark.selectedText.length > 56 ? "..." : ""}
                </div>
              ) : null}
              <Button onClick={requestMentionedRewrite} disabled={!mentionedMark || rewritingMarkId === mentionedMark.id}>
                <Bot size={16} />
                {mentionedMark && rewritingMarkId === mentionedMark.id ? "生成中..." : "按 @标记生成改稿"}
              </Button>
              <p className="text-xs leading-5 text-muted">输入 @ 会显示现有标记，选中后可针对某段正文提要求。</p>
            </div>
          </Card>

          {activeSuggestion ? (
            <Card>
              <CardHeader title="AI 改稿助手" />
              <div className="grid gap-4 p-4 text-sm leading-7">
                <Block title="理解" text={activeSuggestion.understanding} />
                <Block title="修改策略" text={activeSuggestion.strategy} />
                {activeSuggestion.providerNotice ? <Block title="调用状态" text={activeSuggestion.providerNotice} /> : null}
                <div>
                  <p className="font-medium">新版片段</p>
                  <p className="mt-2 rounded-md border border-line bg-mark/60 p-3">{activeSuggestion.newText}</p>
                </div>
                <Block title="改动说明" text={activeSuggestion.changeNotes} />
                {activeSuggestion.memoryImpact.length > 0 ? (
                  <div>
                    <p className="font-medium">可能沉淀的写作记忆</p>
                    <div className="mt-2 grid gap-2">
                      {activeSuggestion.memoryImpact.map((item, index) => (
                        <p key={`${item}-${index}`} className="rounded-md border border-line bg-paper px-3 py-2 text-muted">
                          {item}
                        </p>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="rounded-md border border-line bg-white p-3">
                  <label className="flex items-start gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={memoryUpdateEnabled}
                      onChange={(event) => setMemoryUpdateEnabled(event.target.checked)}
                      className="mt-1"
                    />
                    <span>本次更新写作记忆</span>
                  </label>
                  <p className="mt-2 text-xs leading-5 text-muted">
                    勾选后，下面选中的内容会进入写作记忆库，下一篇自动写作会参考它。
                  </p>
                  <div className="mt-3 grid gap-2">
                    {memoryUpdateOptions.map((option) => (
                      <label key={option.id} className="grid gap-1 rounded-md border border-line bg-paper p-3 text-xs leading-5 text-muted">
                        <span className="flex items-center gap-2 font-medium text-ink">
                          <input
                            type="checkbox"
                            checked={memoryUpdateEnabled && selectedMemoryUpdateIds.includes(option.id)}
                            disabled={!memoryUpdateEnabled}
                            onChange={() => toggleMemoryUpdateOption(option.id)}
                          />
                          {option.label}
                        </span>
                        <span>{option.note}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={applySuggestion}>
                    <Check size={16} />
                    应用修改
                  </Button>
                  <GhostButton onClick={() => activeSuggestionMark && requestRewrite(activeSuggestionMark)} disabled={!activeSuggestionMark || rewritingMarkId === activeSuggestionMark.id}>
                    <RefreshCw size={16} />
                    {activeSuggestionMark && rewritingMarkId === activeSuggestionMark.id ? "生成中..." : "重新生成"}
                  </GhostButton>
                  <GhostButton onClick={() => setActiveSuggestion(null)}>
                    <RotateCcw size={16} />
                    放弃
                  </GhostButton>
                </div>
              </div>
            </Card>
          ) : null}

          {lastApplyResult ? (
            <Card>
              <CardHeader
                title="本次改稿回执"
                eyebrow="版本、差异、记忆沉淀"
                action={<Badge>{lastApplyResult.version.persisted ? "已保存" : "本地文件"}</Badge>}
              />
              <div className="grid gap-4 p-4 text-sm leading-7">
                <p className="text-muted">{lastApplyResult.message}</p>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <MetricPill label="原文" value={`${lastApplyResult.diff.originalLength} 字`} />
                  <MetricPill label="新文" value={`${lastApplyResult.diff.newLength} 字`} />
                  <MetricPill label="变化" value={formatDiffDelta(lastApplyResult.diff.delta)} />
                </div>
                <div className="rounded-md border border-line bg-paper p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{memorySummaryLabel(lastApplyResult.memory)}</Badge>
                    {lastApplyResult.memory.skipped ? <Badge>跳过重复 {lastApplyResult.memory.skipped} 条</Badge> : null}
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted">{lastApplyResult.memory.message}</p>
                  {lastApplyResult.memory.rules.length ? (
                    <div className="mt-3 grid gap-2">
                      {lastApplyResult.memory.rules.slice(0, 3).map((rule) => (
                        <p key={rule} className="line-clamp-2 rounded-md border border-line bg-white px-3 py-2 text-xs leading-5 text-muted">
                          {rule}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="版本历史" />
            <div className="grid gap-3 p-4">
              {versions.length === 0 ? (
                <p className="text-sm text-muted">应用修改后，这里会记录原文、新文和修改原因。</p>
              ) : (
                versions.map((version) => (
                  <div key={version.id} className="rounded-md border border-line bg-white p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-2">
                        <Badge>{version.markLabel}</Badge>
                        <Badge>{version.persisted ? "数据库" : "本地文件"}</Badge>
                        {version.diff ? <Badge>{formatDiffDelta(version.diff.delta)}</Badge> : null}
                      </div>
                      <span className="text-xs text-muted">{version.createdAt}</span>
                    </div>
                    <p className="mt-2 text-muted">{version.reason}</p>
                    <div className="mt-3 grid gap-2">
                      <VersionText label="原文" text={version.originalText} />
                      <VersionText label="新文" text={version.newText} />
                    </div>
                    {version.memory ? <p className="mt-3 text-xs leading-5 text-muted">{version.memory.message}</p> : null}
                    {version.impactNotes.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {version.impactNotes.map((item, index) => (
                          <Badge key={`${item}-${index}`}>{item}</Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </Card>
        </aside>
      </section>
    </div>
  );
}

function FormatButton({ label, icon: Icon, active = false, disabled = false, onRun }: FormatButtonProps) {
  return (
    <GhostButton
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      className={`h-10 w-10 px-0 ${active ? "border-ink bg-white text-ink" : "bg-white"}`}
      onMouseDown={(event) => {
        event.preventDefault();
        onRun();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onRun();
        }
      }}
    >
      <Icon size={16} />
    </GhostButton>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-white px-2 py-2">
      <p className="text-muted">{label}</p>
      <p className="mt-1 font-medium text-ink">{value}</p>
    </div>
  );
}

function toVersionRecord(version: EditorVersionRecord, applyResult?: ApplyRewriteResult): VersionRecord {
  return {
    id: version.id,
    markLabel: version.markLabel,
    originalText: version.originalText,
    newText: version.newText,
    reason: version.reason,
    impactNotes: version.impactNotes,
    persisted: version.persisted,
    diff: applyResult?.diff,
    memory: applyResult?.memory,
    createdAt: new Date(version.createdAt).toLocaleString("zh-CN")
  };
}

function createLocalVersionRecord(index: number, mark: EditorMark, suggestion: RewriteSuggestion, impactNotes = suggestion.memoryImpact): VersionRecord {
  return {
    id: `version-${index}`,
    markLabel: mark.label,
    originalText: mark.selectedText,
    newText: suggestion.newText,
    reason: suggestion.strategy,
    impactNotes,
    persisted: false,
    diff: buildDiffSummary(mark.selectedText, suggestion.newText),
    createdAt: new Date().toLocaleString("zh-CN")
  };
}

function buildDiffSummary(originalText: string, newText: string): ApplyRewriteResult["diff"] {
  const originalLength = countText(originalText);
  const newLength = countText(newText);

  return {
    originalLength,
    newLength,
    delta: newLength - originalLength,
    changed: originalText.replace(/\s+/g, "") !== newText.replace(/\s+/g, "")
  };
}

function formatDiffDelta(delta: number) {
  if (delta === 0) {
    return "字数持平";
  }

  return delta > 0 ? `+${delta} 字` : `${delta} 字`;
}

function memorySummaryLabel(memory: ApplyRewriteResult["memory"]) {
  if (!memory.requested) {
    return "未更新记忆";
  }

  if (memory.created > 0) {
    return `新增记忆 ${memory.created} 条`;
  }

  if (memory.skipped > 0) {
    return "已有同类记忆";
  }

  return "未新增记忆";
}

function buildMemoryUpdateOptions(suggestion: RewriteSuggestion, mark: EditorMark | null | undefined, work: Work | undefined): MemoryUpdateOption[] {
  const sourceNotes = suggestion.memoryImpact.filter(Boolean);
  const optionDrafts: MemoryUpdateOption[] = [
    {
      id: "preference",
      label: "用户偏好",
      note: findMemoryNote(sourceNotes, ["用户偏好", "偏好"]) ?? `用户偏好：${suggestion.strategy}`,
      recommended: true
    },
    {
      id: "character-state",
      label: "人物状态",
      note:
        findMemoryNote(sourceNotes, ["人物状态", "主角"]) ??
        `人物状态：${work?.title ?? "当前作品"}里，角色在「${mark?.label ?? "本次标记"}」后需要延续这次改稿带来的行动变化。`,
      recommended: true
    },
    {
      id: "relationship",
      label: "人物关系",
      note: findMemoryNote(sourceNotes, ["人物关系", "关系"]) ?? "人物关系：检查本次改稿是否改变角色立场、亲疏或信任度，后续场景要保持一致。",
      recommended: Boolean(findMemoryNote(sourceNotes, ["人物关系", "关系"]))
    },
    {
      id: "foreshadow-plant",
      label: "已埋伏笔",
      note: findMemoryNote(sourceNotes, ["已埋伏笔", "伏笔", "线索"]) ?? "已埋伏笔：记录本次新增或强化的证据、物件、承诺、误会或信息差。",
      recommended: Boolean(findMemoryNote(sourceNotes, ["已埋伏笔", "伏笔", "线索"]))
    },
    {
      id: "foreshadow-payoff",
      label: "已兑现伏笔",
      note: findMemoryNote(sourceNotes, ["已兑现伏笔", "兑现", "回收"]) ?? "已兑现伏笔：记录本次是否回收了前文线索，避免后续重复解释或忘记结算。",
      recommended: Boolean(findMemoryNote(sourceNotes, ["已兑现伏笔", "兑现", "回收"]))
    },
    {
      id: "emotion-arc",
      label: "情绪弧线",
      note: findMemoryNote(sourceNotes, ["情绪弧线", "情绪"]) ?? `情绪弧线：本次改稿从「${compactEditorText(mark?.selectedText ?? suggestion.understanding, 26)}」转向「${compactEditorText(suggestion.newText, 26)}」。`,
      recommended: true
    },
    {
      id: "next-note",
      label: "后续写作注意事项",
      note: `后续写作注意事项：${suggestion.changeNotes}`,
      recommended: true
    }
  ];

  const seen = new Set<string>();

  return optionDrafts.filter((option) => {
    const key = `${option.label}:${option.note}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function findMemoryNote(notes: string[], keywords: string[]) {
  return notes.find((note) => keywords.some((keyword) => note.includes(keyword)));
}

function compactEditorText(text: string, maxLength: number) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function Block({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-muted">{text}</p>
    </div>
  );
}

function VersionText({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-md bg-paper px-3 py-2">
      <p className="text-xs font-medium text-ink">{label}</p>
      <p className="mt-1 line-clamp-3 text-xs leading-5 text-muted">{text}</p>
    </div>
  );
}
