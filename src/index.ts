import http from "http"
import express from "express"
import { join, parse } from "path"
import { ensureDir, lstatSync, mkdirpSync, rmdir, statSync } from "fs-extra"
import * as socketio from "socket.io"
import { ChildProcessWithoutNullStreams, spawn } from "child_process"
import debug from "debug"
import recursive from "recursive-readdir"
import { compileMd } from "./lib/compileMd"
import { CodeSnippet, CodeTheme, CompiledMd, LanguagePlugin, MdTheme } from "./types"
import { v4 } from "uuid"
import { rmdirSync, writeFileSync } from "fs"

const log = debug("info")

export const mdFutura = async({
  port = 8080,
  sourcePath,
  buildPath = join(lstatSync(sourcePath).isDirectory() ? sourcePath : parse(sourcePath).dir, ".mdf"),
  codeTheme = "stackoverflow-light",
  mdTheme = "github-markdown-light",
  languagePlugins = {}
}: {
  port?: number,
  buildPath?: string,
  sourcePath: string,
  codeTheme?: CodeTheme,
  mdTheme?: MdTheme,
  languagePlugins?: {
    [language: string]: LanguagePlugin
  }
}): Promise<void> => {

  languagePlugins = {
    js: ({ snippetPath }) => ["node", snippetPath],
    ts: ({ snippetPath }) => ["ts-node", snippetPath],
    py: ({ snippetPath }) => ["python", snippetPath],
    sh: ({ code }) => ["/bin/sh", "-c", code],
    ...languagePlugins
  }
  const supportedLanguages = Object.keys(languagePlugins)
  const app = express()
  const server = http.createServer(app)

  const io = new socketio.Server(server)

  await rmdir(buildPath, { recursive: true })
  await ensureDir(buildPath)

  const compiledMd: CompiledMd[] = []

  if (statSync(sourcePath).isDirectory()) {
    const files = (await recursive(sourcePath)).filter((file) => parse(file).ext.toLocaleLowerCase() === ".md")
    const data = await Promise.all(files.map(mdPath => compileMd({ sourcePath, mdPath, buildPath, codeTheme, mdTheme, supportedLanguages })))
    compiledMd.push(...data)
  } else {
    const data = await compileMd({ sourcePath, mdPath: sourcePath, buildPath, codeTheme, mdTheme, supportedLanguages })
    compiledMd.push(data)
  }

  compiledMd.map(({ path, html }) => app.get(path, (_, res) => res.set("content-type", "text/html").send(html)))

  const codeSnippetsMap = compiledMd.reduce((acc: {[key: string]: CodeSnippet }, { snippets }) => {
    snippets.forEach(e => {
      acc[e.name] = e
    })
    return acc
  }, {})

  app.use("/", express.static(sourcePath))

  app.get("*", (req, res) => {
    res.set("content-type", "text/html").send(`<ul>
      ${compiledMd.map(({ path }) => `<li><a href='http://localhost:${[port]}${path}'>${path}</li>`).join("")}
    </ul>`)
  })

  io.on("connection", socket => {
    const procMapping: {[key: string]: ChildProcessWithoutNullStreams} = {}

    const killProc = (id: string): void => {
      const proc = procMapping[id]
      if (proc) {
        proc.kill()
        log(`proc killed (${id})`)
        delete procMapping[id]
      }
    }

    socket.on("disconnect", () => {
      Object.keys(procMapping).forEach(id => {
        killProc(id)
      })
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

      proc.stdout.on("data", message => {
        log(`sending data (${id})`)
        socket.emit(`${id}-data`, message.toString())
      })

      proc.stderr.on("data", message => {
        log(`sending error (${id})`)
        socket.emit(`${id}-error`, message.toString())
      })

      proc.on("close", () => {
        socket.emit(`${id}-end`)
        rmdirSync(sandboxFolderPath, { recursive: true })
        delete procMapping[id]
      })
    })
  })

  // eslint-disable-next-line no-console
  server.listen(port, () => console.log(`Available resources:\n${compiledMd.map(({ path }) => `- http://localhost:${[port]}${path}`).join("\n")}`))
}
