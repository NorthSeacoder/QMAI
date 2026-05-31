import { Suspense, lazy, useCallback, useRef, useState } from "react"
import { Sparkles, MessageSquare } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { useWikiStore } from "@/stores/wiki-store"
import { OutlineGeneratorDialog, type OutlineGeneratorMode } from "@/components/sources/outline-generator-dialog"
import { PreviewPanel } from "@/components/layout/preview-panel"
import { clampChatHeight } from "@/lib/workspace-layout"

const OutlineChatPanel = lazy(async () => {
  const mod = await import("@/components/sources/outline-chat-panel")
  return { default: mod.OutlineChatPanel }
})

export function SourcesView() {
  const { t } = useTranslation()
  const novelMode = useWikiStore((s) => s.novelMode)
  const [outlineDialogOpen, setOutlineDialogOpen] = useState(false)
  const [outlineDialogMode, setOutlineDialogMode] = useState<OutlineGeneratorMode>("outline")
  const [outlineChatOpen, setOutlineChatOpen] = useState(false)
  const [chatHeight, setChatHeight] = useState(300)
  const containerRef = useRef<HTMLDivElement>(null)
  const resizingRef = useRef(false)

  function openOutlineDialog(mode: OutlineGeneratorMode) {
    setOutlineDialogMode(mode)
    setOutlineDialogOpen(true)
  }

  const startResize = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    resizingRef.current = true
    document.body.style.cursor = "row-resize"
    document.body.style.userSelect = "none"

    const handleMouseMove = (nextEvent: MouseEvent) => {
      if (!containerRef.current || !resizingRef.current) return
      const containerRect = containerRef.current.getBoundingClientRect()
      const newHeight = containerRect.bottom - nextEvent.clientY
      setChatHeight(clampChatHeight(newHeight))
    }

    const handleMouseUp = () => {
      resizingRef.current = false
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }

    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)
  }, [])

  return (
    <div ref={containerRef} className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{t(novelMode ? "novel.sources.title" : "sources.title")}</h2>
        <div className="flex flex-wrap gap-1">
          {novelMode ? (
            <Button size="sm" onClick={() => openOutlineDialog("outline")}>
              <Sparkles className="mr-1 h-4 w-4" />
              {t("novel.outlineGenerator.title")}
            </Button>
          ) : null}
          {novelMode ? (
            <Button size="sm" variant="outline" onClick={() => setOutlineChatOpen(!outlineChatOpen)}>
              <MessageSquare className="mr-1 h-4 w-4" />
              AI大纲
            </Button>
          ) : null}
          {novelMode ? (
            <Button size="sm" variant="outline" onClick={() => openOutlineDialog("refine")}>
              {t("novel.outlineGenerator.refineTitle")}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <PreviewPanel />
      </div>

      {outlineChatOpen && novelMode ? (
        <>
          <div
            className="h-1.5 shrink-0 cursor-row-resize bg-border/40 transition-colors hover:bg-primary/30 active:bg-primary/40"
            onMouseDown={startResize}
          />
          <div className="shrink-0 overflow-hidden border-t bg-background" style={{ height: chatHeight }}>
            <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading...</div>}>
              <OutlineChatPanel onClose={() => setOutlineChatOpen(false)} />
            </Suspense>
          </div>
        </>
      ) : null}

      <OutlineGeneratorDialog
        open={outlineDialogOpen}
        onOpenChange={setOutlineDialogOpen}
        mode={outlineDialogMode}
      />
    </div>
  )
}
