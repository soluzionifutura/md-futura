import { Socket } from "socket.io"
import debug from "debug"
import { rmSync, writeFileSync } from "fs"
import { ChildProcessWithoutNullStreams, spawn } from "child_process"
import { join } from "path"
import { v4 } from "uuid"
import { mkdirpSync } from "fs-extra"
import { CodeSnippet, CompiledMd, LanguagePlugins } from "../types"

const log = debug("info")

export type ProcMapping = {[key: string]: ChildProcessWithoutNullStreams}
export type KillProc = (id: string) => void
export type KillAllProc = () => void
export type CodeSnippetsMap = {[key: string]: CodeSnippet }

export default ({ socket, compiledMd, languagePlugins, buildPath }: { socket: Socket, compiledMd: { [path: string]: CompiledMd }, languagePlugins: LanguagePlugins, buildPath: string}): {
  procMapping: ProcMapping,
  killProc: KillProc,
  killAllProc: KillAllProc,
  codeSnippetsMap: CodeSnippetsMap
} => {
  const codeSnippetsMap = Object.values(compiledMd).reduce((acc: CodeSnippetsMap, { snippets }) => {
    snippets.forEach(e => {
      acc[e.name] = e
    })
    return acc
  }, {})

  const procMapping: ProcMapping = {}

  const killProc = (id: string): void => {
    const proc = procMapping[id]
    if (proc) {
      proc.kill()
      log(`proc killed (${id})`)
      delete procMapping[id]
    }
  }

  const killAllProc: KillAllProc = () => {
    Object.keys(procMapping).forEach(id => {
      killProc(id)
    })
  }

  socket.on("disconnect", () => {
    killAllProc()
  })

  socket.on("kill", id => {
    killProc(id)
  })

  socket.on("exec", id => {
    const codeSnippet = codeSnippetsMap[id]
    if (!codeSnippet) {
      return
    }
    const { language, code } = codeSnippet

    if (procMapping[id]) {
      log(`proc already started (${id})`)
      return
    }

    const languagePlugin = languagePlugins[language]
    if (!languagePlugin) {
      return
    }

    const sandboxFolderPath = join(buildPath, v4())
    const snippetPath = join(sandboxFolderPath, id)
    mkdirpSync(sandboxFolderPath)
    writeFileSync(snippetPath, code)
    const spawnArgs = languagePlugin({ snippetPath, code: codeSnippet.code })

    const proc = procMapping[id] = spawn(spawnArgs.shift()!, spawnArgs, { cwd: sandboxFolderPath })
    log(`proc started (${id})`)

    proc.on("error", (err) => {
      log(`sending error (${id})`)
      socket.emit(`${id}-error`, err.message)
    })

    proc.stdout.on("data", data => {
      log(`sending data (${id})`)
      socket.emit(`${id}-data`, data.toString())
    })

    proc.stderr.on("data", data => {
      log(`sending error (${id})`)
      socket.emit(`${id}-error`, data.toString())
    })

    proc.on("close", () => {
      socket.emit(`${id}-end`)
      rmSync(sandboxFolderPath, { recursive: true })
      delete procMapping[id]
      log(`proc ended (${id})`)
    })
  })

  return {
    procMapping,
    killProc,
    killAllProc,
    codeSnippetsMap
  }
}
