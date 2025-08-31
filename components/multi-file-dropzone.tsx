"use client"
import React from "react"

type Props = {
  onText: (text: string) => void
}

export default function MultiFileDropzone({ onText }: Props) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [drag, setDrag] = React.useState(false)
  const [paste, setPaste] = React.useState("")

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return
    const file = files[0]
    const text = await file.text()
    onText(text)
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          handleFiles(e.dataTransfer.files)
        }}
        className={`border-2 border-dashed rounded-md p-4 text-center transition-colors ${
          drag ? "border-blue-600 bg-gray-100" : "border-gray-500"
        }`}
        role="region"
        aria-label="Log upload dropzone"
      >
        <p className="text-sm text-gray-900 font-sans">
          Drop your log file here, or
          <button
            className="ml-1 text-blue-600 underline"
            onClick={(e) => {
              e.preventDefault()
              inputRef.current?.click()
            }}
          >
            browse
          </button>
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".log,.txt,.csv,.json"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="paste" className="text-sm text-gray-900 font-sans">
          Or paste log text
        </label>
        <textarea
          id="paste"
          className="w-full h-28 border rounded-md p-2 text-sm font-mono"
          placeholder="Paste your log lines here..."
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
        />
        <div className="flex justify-end">
          <button className="px-3 py-1 rounded-md bg-blue-600 text-white text-sm" onClick={() => onText(paste)}>
            Use pasted text
          </button>
        </div>
      </div>
    </div>
  )
}
