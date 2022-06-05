import http from "http"
import express from "express"
import { join, parse } from "path"
import { ensureDir, lstatSync, rmdir, statSync } from "fs-extra"
import * as socketio from "socket.io"
import { ChildProcessWithoutNullStreams, spawn } from "child_process"
import debug from "debug"
import recursive from "recursive-readdir"
import { compileMd } from "./lib/compileMd"
import { CodeTheme, CompiledMd, MdTheme } from "./types"

const log = debug("info")

export const mdFutura = async({
  port = 8080,
  sourcePath,
  buildPath = join(lstatSync(sourcePath).isDirectory() ? sourcePath : parse(sourcePath).dir, ".mdf"),
  codeTheme = "stackoverflow-light",
  mdTheme = "github-markdown-light"
}: {
  port?: number,
  buildPath?: string,
  sourcePath: string,
  codeTheme?: CodeTheme,
  mdTheme?: MdTheme
}): Promise<void> => {
  const app = express()
  const server = http.createServer(app)

  const io = new socketio.Server(server)

  await rmdir(buildPath, { recursive: true })
  await ensureDir(buildPath)

  const compiledMd: CompiledMd[] = []

  if (statSync(sourcePath).isDirectory()) {
    const files = (await recursive(sourcePath)).filter((file) => parse(file).ext.toLocaleLowerCase() === ".md")
    const data = await Promise.all(files.map(mdPath => compileMd({ sourcePath, mdPath, buildPath, codeTheme, mdTheme })))
    compiledMd.push(...data)
  } else {
    const data = await compileMd({ sourcePath, mdPath: sourcePath, buildPath, codeTheme, mdTheme })
    compiledMd.push(data)
  }

  compiledMd.map(({ path, html }) => app.get(path, (_, res) => res.set("content-type", "text/html").send(html)))

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
      if (procMapping[id]) {
        log(`proc already started (${id})`)
        return
      }

      const folderName = id.split(".").slice(0, -2).join(".")
      const proc = procMapping[id] = spawn("node", [join(buildPath, folderName, id)])

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
        delete procMapping[id]
      })
    })
  })

  // eslint-disable-next-line no-console
  server.listen(port, () => console.log(`Available resources:\n${compiledMd.map(({ path }) => `- http://localhost:${[port]}${path}`).join("\n")}`))
}
