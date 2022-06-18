import http from "http"
import express from "express"
import { join, parse } from "path"
import { rm, ensureDir, lstatSync, readFile, statSync, watch, existsSync } from "fs-extra"
import * as socketio from "socket.io"
import recursive from "recursive-readdir"
import { compileMd } from "./lib/compileMd"
import { CodeSnippet, CodeTheme, CompiledMd, LanguagePlugins, MdTheme } from "./types"
import procHandler from "./lib/procHandler"
import { EventEmitter } from "stream"
import { rmdirSync } from "fs"
EventEmitter.defaultMaxListeners = 1000

export const mdFutura = async({
  port = 8080,
  sourcePath,
  buildPath = join(lstatSync(sourcePath).isDirectory() ? sourcePath : parse(sourcePath).dir, ".mdf"),
  codeTheme = "stackoverflow-light",
  mdTheme = "github-markdown-light",
  languagePlugins = {},
  hotReload = true
}: {
  port?: number,
  buildPath?: string,
  sourcePath: string,
  codeTheme?: CodeTheme,
  mdTheme?: MdTheme,
  languagePlugins?: LanguagePlugins,
  hotReload?: boolean
}): Promise<void> => {
  const exitRouter = (options: { exit: boolean }): void => {
    if (options.exit) {
      process.exit()
    }
  }

  void ["SIGINT", "SIGUSR1", "SIGUSR2", "uncaughtException", "SIGTERM"].forEach((eventType) => {
    process.on(eventType, exitRouter.bind(null, { exit: true }))
  })

  process.on("exit", () => {
    try {
      rmdirSync(buildPath)
    } catch (_) {}
  })

  languagePlugins = {
    js: ({ snippetPath }) => ["node", snippetPath],
    ts: ({ snippetPath }) => ["ts-node", snippetPath],
    py: ({ snippetPath }) => ["python3", snippetPath],
    sh: ({ code }) => ["/bin/sh", "-c", code],
    ...languagePlugins
  }
  const supportedLanguages = Object.keys(languagePlugins)
  const app = express()
  const server = http.createServer(app)

  const io = new socketio.Server(server)

  if (existsSync(buildPath)) {
    await rm(buildPath, { recursive: true })
  }
  await ensureDir(buildPath)

  const compiledMd: {[mdPath: string]: CompiledMd } = {}

  const importMd = async(mdPath: string): Promise<CompiledMd> => {
    const md = await readFile(join(sourcePath, mdPath), "utf-8")
    const data = await compileMd({ md, mdPath, codeTheme, mdTheme, supportedLanguages })
    compiledMd[data.mdPath] = data
    return data
  }

  const watchMd = (mdPath: string): void => {
    let trigger = true
    const fullPath = join(sourcePath, mdPath)

    if (hotReload) {
      watch(fullPath, async() => {
        if (trigger) {
          try {
            const data = await importMd(mdPath)
            emitter.emit("fileChange", mdPath, data.contentHtml, data.snippets)
          } catch (err) {
            delete compiledMd[mdPath]
            emitter.emit("fileDeleted", mdPath)
          }
        }
        trigger = !trigger
      })
    }
  }

  const importAndWatchMd = async(mdPath: string): Promise<CompiledMd> => {
    const data = await importMd(mdPath)
    if (hotReload) {
      watchMd(data.mdPath)
    }
    return data
  }

  if (statSync(sourcePath).isDirectory()) {
    const files = (await recursive(sourcePath)).filter((file) => parse(file).ext.toLocaleLowerCase() === ".md")
    await Promise.all(files.map(mdPath => {
      return importAndWatchMd(mdPath.substring(sourcePath.length))
    }))
  } else {
    const { dir, base } = parse(sourcePath)
    sourcePath = dir
    await importAndWatchMd(`/${base}`)
  }

  const emitter = new EventEmitter()

  app.get("*", async({ path }, res, next) => {
    const mdPath = decodeURIComponent(path)

    if (compiledMd[mdPath]) {
      return res.set("content-type", "text/html").send(compiledMd[mdPath].html)
    }

    if (parse(mdPath).ext === ".md") {
      try {
        const { html } = await importAndWatchMd(mdPath)
        return res.set("content-type", "text/html").send(html)
      } catch (err) {
        const { message } = err as Error
        if (!message.includes("ENOENT")) {
          throw err
        }
      }
    }

    next()
  })

  app.use(express.static(sourcePath))

  app.use(async(_, res) => {
    const md = Object.keys(compiledMd).map(mdPath => `- [${mdPath}](${mdPath})`).join("\n")
    const { html } = await compileMd({ md, mdPath: "404", mdTheme, codeTheme, supportedLanguages })
    res.set("content-type", "text/html").send(html)
  })

  io.on("connection", socket => {
    const { codeSnippetsMap } = procHandler({ socket, languagePlugins, buildPath, compiledMd })

    if (hotReload) {
      const fileChangeCallback = (mdPath: string, content: string, snippets: CodeSnippet[]): void => {
        snippets.forEach(e => {
          codeSnippetsMap[e.name] = e
        })
        socket.emit(`fileChanged-${mdPath}`, content)
      }
      emitter.on("fileChange", fileChangeCallback)

      const fileDeletedCallback = (mdPath: string): void => {
        socket.emit(`fileDeleted-${mdPath}`)
      }
      emitter.on("fileDeleted", fileDeletedCallback)

      socket.on("disconnect", () => {
        emitter.removeListener("fileChange", fileChangeCallback)
        emitter.removeListener("fileDeleted", fileDeletedCallback)
      })
    }
  })

  // eslint-disable-next-line no-console
  server.listen(port, () => console.log(`Available resources:\n${Object.keys(compiledMd).map(mdPath => `- http://localhost:${[port]}${mdPath}`).join("\n")}`))
}
