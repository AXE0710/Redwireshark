"use client"

import { useCallback, useRef, useState } from "react"

export function FileDropzone({ onFile }: { onFile: (file: File) => void }) {
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return
      const file = files[0]
      const allowed = [".txt", ".log", ".csv"]
      const ok = allowed.some((ext) => file.name.toLowerCase().endsWith(ext))
      if (!ok) {
        // also allow common text mimetypes for flexibility
        if (!file.type.startsWith("text") && file.type !== "application/vnd.ms-excel") {
          alert("Please upload a .txt, .log, or .csv file.")
          return
        }
      }
      onFile(file)
    },
    [onFile],
  )

  return (
    <div className="flex items-center gap-4">
      <div
        className={`w-full max-w-sm rounded-md border bg-white p-4 transition-colors ${isDragging ? "border-blue-600" : "border-gray-900/10"}`}
        role="button"
        tabIndex={0}
        aria-label="Upload a log file by clicking or dragging and dropping"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setIsDragging(false)
          handleFiles(e.dataTransfer.files)
        }}
      >
        <p className="text-sm text-gray-900 font-medium">Drag & drop log file</p>
        <p className="text-xs text-gray-900/70 mt-1">or click to select (.txt, .log, .csv)</p>
        <input
          ref={inputRef}
          type="file"
          accept=".txt,.log,.csv,text/plain,text/csv"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
    </div>
  )
}
